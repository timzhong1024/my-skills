---
name: bilibili
description: Use `bb-browser` to browse Bilibili feeds and open Bilibili video pages through a real Chrome session.
---

# Bilibili

Use `bb-browser` for Bilibili tasks. Prefer helper scripts over repeated DOM inspection when the task is a feed read or opening a known video.

## Quick Start

Run:

```bash
bb-browser --version
bb-browser status
bb-browser site info bilibili/feed
```

If login is required, make sure you log in inside the exact Chrome instance controlled by `bb-browser`.

## Open Video Page

Open or focus a Bilibili video page:

```bash
bash skills/bilibili/scripts/bilibili_play.sh <video_url_or_bv>
```

The script does two things:

1. Reuse an existing target video tab when available; otherwise open the target video URL.
2. Bring the matching Chrome tab to the front.

## Feed Scripts

Use helper scripts for feed reads:

- Homepage / recommended feed: `skills/bilibili/scripts/bilibili_home_csv.sh`
- Following timeline / `t.bilibili.com`: `skills/bilibili/scripts/bilibili_follow_csv.sh`

Commands:

```bash
bash skills/bilibili/scripts/bilibili_home_csv.sh 50
bash skills/bilibili/scripts/bilibili_follow_csv.sh 50
```

Returned columns:

- `bilibili_home_csv.sh`: `title,url,author,play,danmaku,duration,pub_date`
- `bilibili_follow_csv.sh`: `title,url,author,view,like,share,pub_date`

Column meaning:

- `title`: card title or main content title
- `url`: canonical video / opus / live / article URL when available
- `author`: uploader or dynamic author
- `play` / `view`: main visible count
- `danmaku`: danmaku count on homepage video cards
- `duration`: video duration on homepage video cards
- `like`: like count when visible in follow feed
- `share`: repost/share count when visible in follow feed
- `pub_date`: visible relative or absolute time text

## Token Guardrails

- If the user asks to browse the Bilibili homepage or follow feed, use the helper script first.
- Do not start with `snapshot -i` unless the user explicitly needs structure or a click target.
- Do not paste large raw JSON when CSV is enough.
- Prefer returning CSV rows or a compact subset of rows.
