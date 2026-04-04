#!/usr/bin/env node

import { Buffer } from "node:buffer";

const DYNAMIC_PAGE_PREFIX = "https://t.bilibili.com/";
const FEED_PATH = "/x/polymer/web-dynamic/v1/feed/all";

function parseArgs(argv) {
  let count = 200;
  let continueMode = false;
  for (const arg of argv) {
    if (arg === "--continue" || arg === "--keep") {
      continueMode = true;
    } else {
      count = Number.parseInt(arg, 10);
    }
  }
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`invalid count: ${count}`);
  }
  return { count, continueMode };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status} ${url}`);
  }
  return res.json();
}

async function findDynamicTarget() {
  const targets = await fetchJson("http://127.0.0.1:19825/json/list");
  const page = targets.find((target) => target.type === "page" && String(target.url || "").startsWith(DYNAMIC_PAGE_PREFIX));
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("bilibili dynamic page target not found");
  }
  return page;
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });

    this.ws.addEventListener("message", (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          pending.resolve(msg.result ?? {});
        }
        return;
      }
      const callbacks = this.listeners.get(msg.method);
      if (!callbacks) return;
      for (const cb of callbacks) cb(msg.params ?? {});
    });
  }

  async open() {
    await this.openPromise;
  }

  on(method, cb) {
    const callbacks = this.listeners.get(method) || [];
    callbacks.push(cb);
    this.listeners.set(method, callbacks);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  async close() {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }
}

function normalizeUrl(url) {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { count, continueMode } = parseArgs(process.argv.slice(2));
  const target = await findDynamicTarget();
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();

  const pendingBodies = new Set();
  const seenRequests = new Set();
  const seenItems = new Set();
  const rows = [];
  let rawSeen = 0;
  let filteredNonVideo = 0;

  const addItem = (item) => {
    const key = item?.id_str || item?.basic?.rid_str || item?.basic?.comment_id_str || "";
    if (!key || seenItems.has(key)) return;
    seenItems.add(key);
    rawSeen += 1;

    const modules = item?.modules || {};
    const archive = modules?.module_dynamic?.major?.archive;
    if (!archive) {
      filteredNonVideo += 1;
      return;
    }

    const stat = modules?.module_stat || {};
    rows.push({
      title: archive.title || "",
      url: normalizeUrl(archive.jump_url || ""),
      author: modules?.module_author?.name || "",
      like: stat?.like?.count || "",
      pub_date: modules?.module_author?.pub_time || "",
    });
  };

  const parseBody = (body, base64Encoded) => {
    const text = base64Encoded ? Buffer.from(body, "base64").toString("utf8") : body;
    const payload = JSON.parse(text);
    const items = payload?.data?.items || [];
    for (const item of items) addItem(item);
  };

  cdp.on("Network.responseReceived", (params) => {
    const url = String(params?.response?.url || "");
    if (!url.includes(FEED_PATH) || url.includes("/update")) return;
    seenRequests.add(params.requestId);
  });

  cdp.on("Network.loadingFinished", async (params) => {
    if (!seenRequests.has(params.requestId) || pendingBodies.has(params.requestId)) return;
    pendingBodies.add(params.requestId);
    try {
      const result = await cdp.send("Network.getResponseBody", { requestId: params.requestId });
      parseBody(result.body || "", result.base64Encoded);
    } catch {
    } finally {
      pendingBodies.delete(params.requestId);
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 800,
    y: 700,
  });

  if (!continueMode) {
    await cdp.send("Page.reload", { ignoreCache: false });
    await sleep(2500);
  } else {
    await sleep(1000);
  }

  let stagnantRounds = 0;
  let lastRawSeen = rawSeen;
  const maxRounds = Math.max(20, count);

  for (let i = 0; i < maxRounds; i += 1) {
    if (rawSeen >= count) break;

    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 800,
      y: 700,
      deltaX: 0,
      deltaY: -1200,
    });
    await sleep(150);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 800,
      y: 700,
      deltaX: 0,
      deltaY: 4000,
    });

    await sleep(2200);

    if (rawSeen === lastRawSeen) {
      stagnantRounds += 1;
    } else {
      stagnantRounds = 0;
      lastRawSeen = rawSeen;
    }
    if (stagnantRounds >= 6) break;
  }

  await sleep(1000);

  process.stderr.write(`# raw_seen=${rawSeen}\n`);
  process.stderr.write(`# continue_mode=${continueMode}\n`);
  process.stderr.write(`# filtered_non_video=${filteredNonVideo}\n`);
  process.stderr.write(`# video_count=${rows.length}\n`);

  process.stdout.write("title,url,author,like,pub_date\n");
  for (const row of rows) {
    process.stdout.write(
      [
        row.title,
        row.url,
        row.author,
        row.like,
        row.pub_date,
      ].map(csvEscape).join(",") + "\n"
    );
  }

  await cdp.close();
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
