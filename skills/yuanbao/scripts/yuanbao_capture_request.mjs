#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const YUANBAO_URL = "https://yuanbao.tencent.com/";
const API_PREFIX = "https://yuanbao.tencent.com/api/";
const INCLUDED_PATHS = [
  "/api/chat/",
  "/api/user/agent/conversation/promptSug",
  "/api/user/agent/conversation/updateModel",
];
const STREAM_HOOK_VERSION = 5;

function usage() {
  process.stderr.write("Usage: yuanbao_capture_request.sh [--verbose] <prompt>\n");
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" }).trim();
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}: ${url}`);
  }
  return res.json();
}

async function ensureYuanbaoTab() {
  let targets = await fetchJson("http://127.0.0.1:19825/json/list");
  let page = targets.find((target) => target.type === "page" && String(target.url || "").startsWith(YUANBAO_URL));
  if (!page) {
    run("bb-browser", ["open", YUANBAO_URL]);
    for (let i = 0; i < 20; i += 1) {
      await sleep(1000);
      targets = await fetchJson("http://127.0.0.1:19825/json/list");
      page = targets.find((target) => target.type === "page" && String(target.url || "").startsWith(YUANBAO_URL));
      if (page) break;
    }
  }
  if (!page?.webSocketDebuggerUrl) {
    throw new Error("yuanbao tab not found");
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
      const callbacks = this.listeners.get(msg.method) || [];
      for (const cb of callbacks) cb(msg.params ?? {});
    });
  }

  async open() {
    await this.openPromise;
  }

  on(method, cb) {
    const list = this.listeners.get(method) || [];
    list.push(cb);
    this.listeners.set(method, list);
  }

  send(method, params = {}) {
    const id = this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
      this.ws.close();
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldPrint(url) {
  return INCLUDED_PATHS.some((path) => url.includes(path));
}

const CP1252_REVERSE = new Map([
  [0x20AC, 0x80],
  [0x201A, 0x82],
  [0x0192, 0x83],
  [0x201E, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02C6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8A],
  [0x2039, 0x8B],
  [0x0152, 0x8C],
  [0x017D, 0x8E],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201C, 0x93],
  [0x201D, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02DC, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9A],
  [0x203A, 0x9B],
  [0x0153, 0x9C],
  [0x017E, 0x9E],
  [0x0178, 0x9F],
]);

function toCp1252Bytes(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code <= 0xFF) {
      bytes.push(code);
      continue;
    }
    const mapped = CP1252_REVERSE.get(code);
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    return null;
  }
  return Buffer.from(bytes);
}

function maybeFixMojibake(text) {
  if (!text) return text;
  const suspicious = (text.match(/[ÃÂÐÑæåäç]/g) || []).length;
  if (suspicious < 4) return text;
  try {
    const bytes = toCp1252Bytes(text);
    if (!bytes) return text;
    const fixed = bytes.toString("utf8");
    const replacementCount = (fixed.match(/\uFFFD/g) || []).length;
    if (replacementCount > 0) return text;
    return fixed;
  } catch {
    return text;
  }
}

function cleanupMarkdown(text) {
  return text
    .replace(/\[]\(@mark_underline=\d+\)/g, "")
    .replace(/\[citation:\d+\]/g, "")
    .replace(/\[citation:[^\]\n]*/g, "")
    .replace(/\[]\(@mark_underline=[^)\n]*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSsePayload(body) {
  if (!body || !body.includes("data:")) return { text: "", citations: [] };
  const parts = [];
  const citations = [];
  const seenCitationUrls = new Set();
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6);
    if (!payload.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.type === "text" && typeof parsed.msg === "string") {
        parts.push(parsed.msg);
      }
      if (parsed?.type === "searchGuid" && Array.isArray(parsed.docs)) {
        for (const doc of parsed.docs) {
          const url = String(doc?.web_url || doc?.url || "").trim();
          const title = String(doc?.title || "").trim();
          if (!url || !title || seenCitationUrls.has(url)) continue;
          seenCitationUrls.add(url);
          citations.push({
            title: maybeFixMojibake(title),
            url,
            source: maybeFixMojibake(String(doc?.webSiteSource || doc?.web_site_name || doc?.sourceName || "").trim()),
            publishTime: maybeFixMojibake(String(doc?.publish_time || "").trim()),
          });
        }
      }
    } catch {
      // ignore non-JSON SSE data lines
    }
  }
  return {
    text: cleanupMarkdown(maybeFixMojibake(parts.join(""))),
    citations,
  };
}

function renderMarkdownWithCitations(text, citations) {
  const sections = [];
  if (text) sections.push(text);
  if (citations.length > 0) {
    const lines = citations.map((citation, idx) => {
      const suffix = [citation.source, citation.publishTime].filter(Boolean).join(" | ");
      return suffix
        ? `${idx + 1}. [${citation.title}](${citation.url}) - ${suffix}`
        : `${idx + 1}. [${citation.title}](${citation.url})`;
    });
    sections.push(`## 引用\n\n${lines.join("\n")}`);
  }
  return sections.join("\n\n").trim();
}

async function installStreamHook(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const cleanupMarkdown = (text) => text
          .replace(/\\[]\\(@mark_underline=\\d+\\)/g, '')
          .replace(/\\[citation:\\d+\\]/g, '')
          .replace(/\\[citation:[^\\]\\n]*/g, '')
          .replace(/\\[]\\(@mark_underline=[^)\\n]*/g, '')
          .replace(/[ \\t]+\\n/g, '\\n')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();
        const state = window.__codexYuanbaoStream || {
          installed: false,
          version: 0,
          chunks: [],
          rawText: '',
          cleanText: '',
          citations: [],
          done: false,
          error: null,
          running: false,
        };

        state.chunks = [];
        state.rawText = '';
        state.cleanText = '';
        state.citations = [];
        state.done = false;
        state.error = null;
        state.running = false;

        if (!state.installed || state.version !== ${STREAM_HOOK_VERSION}) {
          const startStreamCapture = (streamState) => {
            streamState.chunks = [];
            streamState.rawText = '';
            streamState.cleanText = '';
            streamState.citations = [];
            streamState.done = false;
            streamState.error = null;
            streamState.running = true;
            return {
              buffer: '',
              seenCitationUrls: new Set(),
              processEvent(eventText) {
                const lines = eventText.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').split('\\n');
                const dataLines = lines.filter((line) => line.startsWith('data: ')).map((line) => line.slice(6));
                if (dataLines.length === 0) return;
                const payload = dataLines.join('\\n').trim();
                if (!payload || payload === '[DONE]') return;
                if (!payload.startsWith('{')) return;
                let parsed;
                try {
                  parsed = JSON.parse(payload);
                } catch {
                  return;
                }

                if (parsed?.type === 'text' && typeof parsed.msg === 'string') {
                  streamState.rawText += parsed.msg;
                  const emitTarget = streamState.rawText;
                  if (emitTarget.startsWith(streamState.cleanText)) {
                    const delta = emitTarget.slice(streamState.cleanText.length);
                    if (delta) {
                      streamState.chunks.push(delta);
                      streamState.cleanText = emitTarget;
                    }
                  }
                }

                if (parsed?.type === 'searchGuid' && Array.isArray(parsed.docs)) {
                  for (const doc of parsed.docs) {
                    const url = String(doc?.web_url || doc?.url || '').trim();
                    const title = String(doc?.title || '').trim();
                    if (!url || !title || this.seenCitationUrls.has(url)) continue;
                    this.seenCitationUrls.add(url);
                    streamState.citations.push({
                      title,
                      url,
                      source: String(doc?.webSiteSource || doc?.web_site_name || doc?.sourceName || '').trim(),
                      publishTime: String(doc?.publish_time || '').trim(),
                    });
                  }
                }
              },
              pushText(text) {
                this.buffer += text;
                this.buffer = this.buffer.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
                let boundary;
                while ((boundary = this.buffer.indexOf('\\n\\n')) !== -1) {
                  const eventText = this.buffer.slice(0, boundary);
                  this.buffer = this.buffer.slice(boundary + 2);
                  this.processEvent(eventText);
                }
              },
              finish() {
                if (this.buffer.trim()) this.processEvent(this.buffer);
                const finalText = streamState.rawText;
                if (finalText.startsWith(streamState.cleanText)) {
                  const delta = finalText.slice(streamState.cleanText.length);
                  if (delta) {
                    streamState.chunks.push(delta);
                    streamState.cleanText = finalText;
                  }
                }
                streamState.done = true;
                streamState.running = false;
              },
            };
          };

          const originalFetch = window.fetch.bind(window);
          window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            try {
              const input = args[0];
              const url = typeof input === 'string' ? input : String(input?.url || '');
              if (!url.includes('/api/chat/')) return response;
              const streamState = window.__codexYuanbaoStream;
              const parser = startStreamCapture(streamState);

              const clone = response.clone();
              const reader = clone.body?.getReader();
              if (!reader) {
                streamState.error = 'chat response body reader unavailable';
                streamState.done = true;
                streamState.running = false;
                return response;
              }

              const decoder = new TextDecoder();

              (async () => {
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    parser.pushText(decoder.decode(value, { stream: true }));
                  }
                  parser.pushText(decoder.decode());
                } catch (error) {
                  streamState.error = String(error?.message || error);
                } finally {
                  parser.finish();
                }
              })();
            } catch (error) {
              const streamState = window.__codexYuanbaoStream;
              streamState.error = String(error?.message || error);
              streamState.done = true;
              streamState.running = false;
            }
            return response;
          };

          const xhrOpen = XMLHttpRequest.prototype.open;
          const xhrSend = XMLHttpRequest.prototype.send;
          XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this.__codexUrl = String(url || '');
            return xhrOpen.call(this, method, url, ...rest);
          };
          XMLHttpRequest.prototype.send = function(...args) {
            if (String(this.__codexUrl || '').includes('/api/chat/')) {
              const streamState = window.__codexYuanbaoStream;
              const parser = startStreamCapture(streamState);
              let lastIndex = 0;
              this.addEventListener('progress', () => {
                try {
                  const next = this.responseText.slice(lastIndex);
                  lastIndex = this.responseText.length;
                  if (next) parser.pushText(next);
                } catch (error) {
                  streamState.error = String(error?.message || error);
                }
              });
              this.addEventListener('loadend', () => {
                try {
                  const next = this.responseText.slice(lastIndex);
                  if (next) parser.pushText(next);
                } catch {}
                parser.finish();
              });
            }
            return xhrSend.apply(this, args);
          };
          state.installed = true;
          state.version = ${STREAM_HOOK_VERSION};
        }

        window.__codexYuanbaoStream = state;
        return { ok: true };
      })()
    `,
    returnByValue: true,
  });
  if (!result?.result?.value?.ok) {
    throw new Error(`failed to install yuanbao stream hook: ${JSON.stringify(result?.result?.value || {})}`);
  }
}

async function pullStreamState(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const state = window.__codexYuanbaoStream || {};
        const chunks = Array.isArray(state.chunks) ? state.chunks.splice(0, state.chunks.length) : [];
        return {
          chunks,
          done: !!state.done,
          error: state.error || '',
          citations: Array.isArray(state.citations) ? state.citations : [],
        };
      })()
    `,
    returnByValue: true,
  });
  return result?.result?.value || { chunks: [], done: false, error: "", citations: [] };
}

async function focusEditor(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const el = document.querySelector('.ql-editor');
        if (!el) return { ok: false, reason: 'editor-not-found' };
        el.focus();
        return { ok: true };
      })()
    `,
    returnByValue: true,
  });
  if (!result?.result?.value?.ok) {
    throw new Error(`failed to focus yuanbao editor: ${JSON.stringify(result?.result?.value || {})}`);
  }
}

async function clearEditor(cdp) {
  const result = await cdp.send("Runtime.evaluate", {
    expression: `
      (() => {
        const el = document.querySelector('.ql-editor');
        if (!el) return { ok: false, reason: 'editor-not-found' };
        el.innerHTML = '';
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
        return { ok: true };
      })()
    `,
    returnByValue: true,
  });
  if (!result?.result?.value?.ok) {
    throw new Error(`failed to clear yuanbao editor: ${JSON.stringify(result?.result?.value || {})}`);
  }
}

async function typePrompt(cdp, prompt) {
  await cdp.send("Input.insertText", { text: prompt });
}

async function pressEnter(cdp) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
    code: "Enter",
    key: "Enter",
    unmodifiedText: "\r",
    text: "\r",
  });
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 36,
    code: "Enter",
    key: "Enter",
  });
}

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const prompt = args.filter((arg) => arg !== "--verbose").join(" ").trim();
  if (!prompt) {
    usage();
    process.exit(2);
  }

  const page = await ensureYuanbaoTab();
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.open();

  const seen = new Set();
  const trackedRequests = new Map();
  let finalMarkdown = "";
  let chatCitations = [];
  let chatResolved = false;
  let resolveChatDone;
  const chatDone = new Promise((resolve) => {
    resolveChatDone = resolve;
  });

  cdp.on("Network.requestWillBeSent", (params) => {
    const req = params.request || {};
    const url = String(req.url || "");
    if (!url.startsWith(API_PREFIX)) return;
    if ((req.method || "") !== "POST") return;
    if (!shouldPrint(url)) return;

    const key = `${url}\n${req.postData || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    trackedRequests.set(params.requestId, {
      url,
      method: req.method,
      postData: req.postData || "",
    });

    if (verbose) {
      const payload = {
        type: "request",
        url,
        method: req.method,
        postData: req.postData || "",
      };
      process.stdout.write(JSON.stringify(payload) + "\n");
    }
  });

  cdp.on("Network.responseReceived", (params) => {
    const tracked = trackedRequests.get(params.requestId);
    if (!tracked) return;
    tracked.status = params.response?.status;
    tracked.mimeType = params.response?.mimeType || "";
  });

  cdp.on("Network.loadingFinished", async (params) => {
    const tracked = trackedRequests.get(params.requestId);
    if (!tracked || tracked.responsePrinted) return;
    tracked.responsePrinted = true;
    try {
      const result = await cdp.send("Network.getResponseBody", { requestId: params.requestId });
      const responseBody = result.base64Encoded
        ? Buffer.from(result.body || "", "base64").toString("utf8")
        : (result.body || "");
      const normalizedBody = maybeFixMojibake(responseBody);
      const isChatResponse = tracked.url.includes("/api/chat/");
      const ssePayload = tracked.mimeType === "text/event-stream" ? parseSsePayload(normalizedBody) : { text: "", citations: [] };
      if (verbose) {
        process.stdout.write(
          JSON.stringify({
            type: "response",
            url: tracked.url,
            status: tracked.status ?? null,
            mimeType: tracked.mimeType || "",
            body: normalizedBody,
            ...(ssePayload.text ? { text: ssePayload.text } : {}),
            ...(ssePayload.citations.length > 0 ? { citations: ssePayload.citations } : {}),
          }) + "\n"
        );
      }
      if (isChatResponse && !chatResolved) {
        finalMarkdown = renderMarkdownWithCitations(ssePayload.text, ssePayload.citations);
        chatCitations = ssePayload.citations;
        chatResolved = true;
        resolveChatDone();
      }
    } catch (error) {
      if (verbose) {
        process.stdout.write(
          JSON.stringify({
            type: "response_error",
            url: tracked.url,
            error: String(error?.message || error),
          }) + "\n"
        );
      }
      if (tracked.url.includes("/api/chat/") && !chatResolved) {
        chatResolved = true;
        resolveChatDone();
      }
    }
  });

  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable", { maxPostDataSize: 262144 });
  await cdp.send("Page.bringToFront");
  if (!verbose) {
    await installStreamHook(cdp);
  }

  await focusEditor(cdp);
  await clearEditor(cdp);
  await sleep(200);
  await typePrompt(cdp, prompt);
  await sleep(250);
  await pressEnter(cdp);
  if (verbose) {
    await Promise.race([chatDone, sleep(20000)]);
  } else {
    let citations = [];
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const state = await pullStreamState(cdp);
      if (state.error) {
        throw new Error(state.error);
      }
      for (const chunk of state.chunks || []) {
        process.stdout.write(chunk);
      }
      if (Array.isArray(state.citations) && state.citations.length > 0) {
        citations = state.citations;
      }
      if (state.done) {
        if (citations.length === 0) {
          await Promise.race([chatDone, sleep(5000)]);
          if (chatCitations.length > 0) {
            citations = chatCitations;
          }
        }
        if (citations.length > 0) {
          process.stdout.write(`\n\n## 引用\n\n`);
          const lines = citations.map((citation, idx) => {
            const suffix = [citation.source, citation.publishTime].filter(Boolean).join(" | ");
            return suffix
              ? `${idx + 1}. [${citation.title}](${citation.url}) - ${suffix}`
              : `${idx + 1}. [${citation.title}](${citation.url})`;
          });
          process.stdout.write(`${lines.join("\n")}\n`);
        } else {
          process.stdout.write("\n");
        }
        break;
      }
      await sleep(200);
    }
  }

  cdp.close();

  if (!verbose && !finalMarkdown) {
    return;
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exitCode = 1;
});
