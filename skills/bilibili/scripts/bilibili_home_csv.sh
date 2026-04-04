#!/usr/bin/env bash
set -euo pipefail

target="${1:-50}"
scrolls="${2:-20}"

bb-browser open https://www.bilibili.com/ >/dev/null

python3 - "$target" "$scrolls" <<'PY'
import csv
import json
import subprocess
import sys
import time

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
      const cards = Array.from(document.querySelectorAll(".bili-video-card__wrap"))
        .map((card) => {
          const videoLink = Array.from(card.querySelectorAll('a[href*="/video/"]')).find((a) => {
            const href = a.getAttribute("href") || "";
            return /\/video\/BV/i.test(href) && !href.includes("cm.bilibili.com");
          });
          if (!videoLink) {
            return null;
          }

          const title =
            normalize(card.querySelector(".bili-video-card__info--tit")?.textContent) ||
            normalize(videoLink.getAttribute("title")) ||
            normalize(videoLink.textContent);

          const statItems = Array.from(
            card.querySelectorAll(".bili-video-card__stats--item, .bili-video-card__stats__item")
          ).map((item) => normalize(item.textContent)).filter(Boolean);

          return {
            title,
            url: (videoLink.href || "").split("?")[0].replace(/^http:/, "https:"),
            author:
              normalize(card.querySelector(".bili-video-card__info--author")?.textContent) ||
              normalize(card.querySelector(".bili-video-card__info--owner")?.textContent),
            play: statItems[0] || "",
            danmaku: statItems[1] || "",
            duration: normalize(
              card.querySelector(".bili-video-card__stats__duration, .bili-video-card__duration")?.textContent
            ),
            pub_date:
              normalize(card.querySelector(".bili-video-card__info--date")?.textContent) ||
              normalize(card.querySelector(".bili-video-card__info--time")?.textContent),
          };
        })
        .filter(Boolean);
      return JSON.stringify(cards);
    })()'''
    return json.loads(eval_js(js))

seen = set()
rows = []

for _ in range(scrolls):
    for item in extract():
        key = item["url"]
        if not key or key in seen:
            continue
        seen.add(key)
        rows.append(item)
        if len(rows) >= target:
            break
    if len(rows) >= target:
        break
    scroll_down(3200)
    time.sleep(2.0)

writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["title", "url", "author", "play", "danmaku", "duration", "pub_date"])
for row in rows[:target]:
    writer.writerow([
        row.get("title", ""),
        row.get("url", ""),
        row.get("author", ""),
        row.get("play", ""),
        row.get("danmaku", ""),
        row.get("duration", ""),
        row.get("pub_date", ""),
    ])
PY
