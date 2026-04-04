---
name: yuanbao
description: Use Chrome DevTools Protocol to drive the Yuanbao web app, submit prompts, and print Yuanbao web AI requests and responses to stdout.
---

# Yuanbao

Use the helper script when the goal is to inspect how the Yuanbao web app talks to its backend.

Current status:

- The CDP capture path works.
- The default streaming mode is still unstable because it depends on the web app's current transport behavior and login state.
- Use `--verbose` when you need the most reliable raw request/response capture.

## Quick Start

Run:

```bash
bb-browser status
bash skills/yuanbao/scripts/yuanbao_capture_request.sh "搜索老冯云数最新微信公众号文章"
```

The script:

- ensures a `https://yuanbao.tencent.com/` tab exists
- attaches directly to that tab over Chrome DevTools Protocol
- focuses the editor and types the prompt through real keyboard events
- presses Enter to submit
- prints the final assistant answer as Markdown to stdout
- appends search citations at the end of the Markdown

Use verbose mode when you need transport details:

```bash
bash skills/yuanbao/scripts/yuanbao_capture_request.sh --verbose "搜索老冯云数最新微信公众号文章"
```

This prints matching Yuanbao POST requests and responses to stdout as JSON lines.

## Output

Default mode stdout is plain Markdown.

Verbose mode stdout is JSON lines.

- `type: "request"`
- `url`
- `method`
- `postData`

Response lines have:

- `type: "response"`
- `url`
- `status`
- `mimeType`
- `body`
- `text` for the assembled assistant output when the response is `text/event-stream`
- `citations` for parsed search references when available

The main completion exchange is currently:

- `POST https://yuanbao.tencent.com/api/chat/<cid>`

Related prompt-side requests such as `promptSug` or `updateModel` may also be printed if they are triggered by the same submission.

## Requirements

- The controlled Chrome instance must already be logged into Yuanbao.
- If no Yuanbao tab is open, the script opens one and waits for it to load.
- Default mode is intended for direct consumption as a Markdown answer.
- Verbose mode is intended for transport inspection. It prints the raw SSE body and also extracts the readable assistant text into `text`.
