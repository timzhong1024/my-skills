#!/usr/bin/env bash
set -euo pipefail

target="${1:-50}"
scrolls="${2:-20}"

bb-browser open https://t.bilibili.com/ >/dev/null

python3 - "$target" "$scrolls" <<'PY'
import csv
import json
import subprocess
import sys
import time
import re

target = int(sys.argv[1])
scrolls = int(sys.argv[2])

def eval_js(js: str) -> str:
    out = subprocess.check_output(["bb-browser", "eval", js], text=True)
    return out.strip()

def scroll_down(px: int) -> None:
    eval_js(f"window.scrollBy(0, {px}); 'ok'")

def extract():
    js = r'''(() => {
      const normalize = (value) => (value || "").replace(/\s+/g, " ").trim();
      const isStatLine = (value) => {
        if (!value) return true;
        if (["转发", "评论", "点赞", "分享", "收藏", "直播中"].includes(value)) return true;
        if (/^[\d.]+[万亿]?$/.test(value)) return true;
        if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return true;
        return false;
      };

      const items = Array.from(document.querySelectorAll(".bili-dyn-list__item")).map((item) => {
        const author = normalize(item.querySelector(".bili-dyn-title__text")?.textContent);
        const pubDate = normalize(item.querySelector(".bili-dyn-item__desc")?.textContent);
        const textLines = (item.innerText || "")
          .split("\n")
          .map((line) => normalize(line))
          .filter(Boolean);
        const candidateTitle =
          normalize(item.querySelector(".bili-dyn-card-video__title")?.textContent) ||
          normalize(item.querySelector(".dyn-card-opus__title")?.textContent) ||
          normalize(item.querySelector('[data-module="desc"]')?.textContent) ||
          textLines.find((line, idx) => idx > 1 && !isStatLine(line) && line !== author && line !== pubDate) ||
          "";

        const anchors = Array.from(item.querySelectorAll("a[href]"));
        const url =
          anchors.find((a) => /\/video\/BV/i.test(a.href))?.href ||
          anchors.find((a) => /\/opus\/\d+/i.test(a.href))?.href ||
          anchors.find((a) => /live\.bilibili\.com/i.test(a.href))?.href ||
          anchors.find((a) => /\/read\/cv\d+/i.test(a.href))?.href ||
          item.querySelector("[data-url]")?.getAttribute("data-url") ||
          "";

        return {
          title: candidateTitle,
          url: url.startsWith("//") ? `https:${url}` : url,
          author,
          pub_date: pubDate,
          raw_lines: textLines,
        };
      });

      return JSON.stringify(items);
    })()'''
    return json.loads(eval_js(js))

def parse_metrics(lines):
    numeric = [line for line in lines if re.fullmatch(r"[\d.]+[万亿]?", line)]
    if not numeric:
        return "", "", ""
    if "转发" in lines and len(numeric) >= 3:
        return numeric[-3], numeric[-2], numeric[-1]
    if len(numeric) >= 2:
        return numeric[-2], "", numeric[-1]
    return numeric[-1], "", ""

seen = set()
rows = []

for _ in range(scrolls):
    for item in extract():
        key = item["url"] or "\0".join(item["raw_lines"][:4])
        if key in seen:
            continue
        seen.add(key)

        view, share, like = parse_metrics(item["raw_lines"])
        rows.append(
            {
                "title": item["title"],
                "url": item["url"],
                "author": item["author"],
                "view": view,
                "like": like,
                "share": share,
                "pub_date": item["pub_date"],
            }
        )
        if len(rows) >= target:
            break
    if len(rows) >= target:
        break
    scroll_down(4200)
    time.sleep(2.0)

writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["title", "url", "author", "view", "like", "share", "pub_date"])
for row in rows[:target]:
    writer.writerow([row["title"], row["url"], row["author"], row["view"], row["like"], row["share"], row["pub_date"]])
PY
