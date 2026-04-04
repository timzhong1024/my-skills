#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: bilibili_play.sh <video_url_or_bv>"
  exit 1
fi

query="$*"
target_url=""
if [[ "$query" == http://* || "$query" == https://* ]]; then
  target_url="${query%%\?*}"
elif [[ "$query" =~ ^BV[0-9A-Za-z]+$ ]]; then
  target_url="https://www.bilibili.com/video/$query/"
else
  echo "未找到可直接打开的视频 URL。请用完整视频链接或 BV 号重试。"
  exit 2
fi

resolve_tab_index() {
  local tabs_json
  tabs_json="$(bb-browser tab list --json)"
  TABS_JSON="$tabs_json" TARGET_URL="$target_url" python3 - <<'PY'
import json
import os

raw = os.environ.get("TABS_JSON", "")
target = os.environ.get("TARGET_URL", "").strip().lower()
if not raw.strip():
    print("")
    raise SystemExit(0)

data = json.loads(raw)
for tab in data.get("data", {}).get("tabs", []):
    url = (tab.get("url") or "").strip().lower()
    if url.startswith(target):
        print(tab.get("index", ""))
        break
else:
    print("")
PY
}

activate_target_tab() {
  local match_index
  match_index="$(resolve_tab_index)"
  if [[ -n "$match_index" ]]; then
    bb-browser tab "$match_index" >/dev/null
  else
    bb-browser open "$target_url" >/dev/null
  fi
}

bring_chrome_forward() {
  osascript - "$target_url" <<'APPLESCRIPT' >/dev/null
on run argv
  set targetUrl to item 1 of argv
  tell application "Google Chrome"
    activate
    repeat with w in windows
      set i to 1
      repeat with t in tabs of w
        set tabUrl to URL of t
        if tabUrl starts with targetUrl then
          set active tab index of w to i
          set index of w to 1
          activate
          return
        end if
        set i to i + 1
      end repeat
    end repeat
  end tell
end run
APPLESCRIPT
}

activate_target_tab
bring_chrome_forward

echo "已打开页面：$target_url"
