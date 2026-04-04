---
name: bilibili
description: Use `bb-browser` plus Chrome DevTools Protocol to read the Bilibili follow feed and open Bilibili video pages through a real Chrome session.
---

# Bilibili

Use `bb-browser` for Bilibili tasks. Prefer the helper scripts over repeated DOM inspection when the task is reading the follow feed or opening a known video.

## Quick Start

Run:

```bash
bb-browser --version
bb-browser status
bb-browser tab list
```

If login is required, log in inside the exact Chrome instance controlled by `bb-browser`.

## Open Video Page

Open or focus a Bilibili video page:

```bash
bash skills/bilibili/scripts/bilibili_play.sh <video_url_or_bv>
```

The script reuses an existing matching video tab when possible, otherwise opens the target video URL and brings that Chrome tab to the front.

## Follow Feed Script

Use the helper script for `https://t.bilibili.com/`:

```bash
bash skills/bilibili/scripts/bilibili_follow_csv.sh 50
bash skills/bilibili/scripts/bilibili_follow_csv.sh 20 --continue
```

Implementation notes:

- `bilibili_follow_csv.sh` is the stable entrypoint.
- It delegates to `skills/bilibili/scripts/bilibili_follow_cdp.mjs`.
- The collector connects directly to Chrome DevTools Protocol.
- It listens to `Network.responseReceived` and `Network.loadingFinished`.
- It filters `x/polymer/web-dynamic/v1/feed/all` responses and reads bodies through `Network.getResponseBody`.
- It does not parse DOM cards.

Returned columns:

- `title,url,author,like,pub_date`

Column meaning:

- `title`: video title
- `url`: canonical video URL
- `author`: uploader name from dynamic feed responses
- `like`: like count from dynamic feed responses
- `pub_date`: publish time text from dynamic feed responses

Follow feed semantics:

- The numeric argument is the target number of raw dynamic items to observe, not the final CSV row count.
- Non-video dynamics are filtered out before CSV output.
- The script writes `raw_seen`, `filtered_non_video`, and `video_count` to stderr.
- `--continue` means: stay on the existing `https://t.bilibili.com/` tab, do not refresh, and only capture newly triggered feed responses while continuing to scroll downward.

## Token Guardrails

- If the user asks to browse the Bilibili follow feed, use the helper script first.
- Do not start with `snapshot -i` unless the user explicitly needs structure or a click target.
- Do not paste large raw JSON when CSV is enough.
- Prefer returning CSV rows or a compact subset of rows.
