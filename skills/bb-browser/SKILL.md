---
name: bb-browser
description: Run the local `bb-browser` CLI to control a real Chrome session, inspect adapters, verify login state, and fetch structured data from supported websites.
---

# BB Browser

Use `bb-browser` directly. Prefer the smallest command that can verify the path first.

## Quick Start

Run:

```bash
bb-browser --version
bb-browser status
bb-browser site list
```

If adapters are missing:

```bash
bb-browser site update
```

## Core Workflow

1. Confirm binary and daemon state.
2. Confirm the adapter with `bb-browser site info <name>`.
3. Run one minimal read-only command first.
4. If login is required, make the user log into the exact browser instance controlled by `bb-browser`.
5. Retry only the failed command.

## Login and Identity

Do not assume `bb-browser` is using the browser window the user just touched.

Use:

```bash
bb-browser open https://example.com
```

Then identify that browser window, log in there, and rerun the target command.

Useful paths:

- `~/.bb-browser/daemon.json`
- `~/.bb-browser/bb-sites`
- `~/.bb-browser/browser/user-data`

## Reading Strategy

If `snapshot -i` shows more than 50 interactive refs, stop using a11y snapshots unless exact refs are required.

Prefer this lower-token path:

1. `bb-browser screenshot <path>`
2. `sips -Z 1280 <path>`
3. Read the resized image

Use `snapshot -i` only for precise structure or exact click targets.

## Diagnosis

- `Not logged in`, `HTTP 401`, missing auth cookie: real login issue.
- `request timed out`: retry once; often load delay or adapter weakness.
- `TypeError: Failed to fetch`: usually adapter/network-side failure.
- Site-context errors like missing page config: often the controlled browser is not on the expected page.
- `IP address abnormal`: likely site risk control, not just login.

## Common Commands

Inspect adapters:

```bash
bb-browser site list
bb-browser site info bilibili/feed
bb-browser site info twitter/search
```

Generic browser control:

```bash
bb-browser open https://example.com
bb-browser snapshot -i
bb-browser tab list
bb-browser get title 0
bb-browser get url 0
bb-browser eval "<js>"
bb-browser fetch "<url>"
```

## Output Handling

Prefer structured adapter fields over paraphrasing. For search/feed results, preserve:

- `title` or main text
- `author` or account
- `timestamp`
- `url`
- engagement fields when present

If fields are missing, say so instead of inventing values.
