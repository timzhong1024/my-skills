---
name: china-mainland-risk-control
description: Use when automating, reverse engineering, or debugging anti-abuse and account-safety issues on China mainland consumer platforms, especially with bb-browser, CDP, injected scripts, or web automation. This skill is a risk-control guardrail for China mainland platforms only; do not apply it by default to non-China-mainland sites unless the user explicitly asks.
---

# China Mainland Risk Control

Use this skill when account safety matters on China mainland platforms such as Tencent, ByteDance, Alibaba, Bilibili, Xiaohongshu, Zhihu, WeChat ecosystem sites, and similar services.

Do not apply this skill by default to non-China-mainland sites. For non-China-mainland platforms, use normal engineering judgment unless the user explicitly asks for the stricter posture.

## When To Use

Use this skill if any of the following is true:

- the user mentions `风控`、`封号`、`异常`、`反爬`、`检测`、`限制`
- the task uses `bb-browser`, CDP, browser automation, request capture, JS injection, or scripted login/session reuse
- the target is a China mainland consumer platform and the work goes beyond ordinary manual browsing

## Default Posture

For China mainland platforms, bias toward the least observable approach that still solves the task.

Priority order:

1. Manual browsing or built-in site export
2. Read-only browser inspection without page mutation
3. Pure CDP observation without changing page JS
4. Controlled human-in-the-loop interaction
5. Page injection, monkey-patching, DOM rewriting, or synthetic high-frequency automation only if explicitly accepted as risky

If a higher-risk approach is chosen, say so plainly before doing it.

## High-Risk Signals

These patterns are especially likely to trigger detection on China mainland platforms:

- repeatedly opening the same site, route, chat, or agent page in a short period
- replacing or monkey-patching `fetch`, `XMLHttpRequest`, `WebSocket`, `Promise`, or other global primitives
- injecting long-lived hooks into the page runtime
- direct DOM rewriting of editors, forms, or app state
- runtime/browser fingerprints that look inconsistent or low-entropy, such as abnormal `navigator.plugins`, `mimeTypes`, `permissions`, `window.chrome`, `Intl`, `screen`, Canvas, WebGL, AudioContext, or font combinations
- obvious automation markers such as `navigator.webdriver`, common webdriver globals, or other detectable injected artifacts
- event objects or input traces that do not resemble real hardware input, including suspicious `isTrusted`, pointer movement, target path, or missing composition/touch/scroll context
- scripted input with unrealistically fast focus, clear, paste, submit sequences
- fixed or highly regular timing between focus, clear, input, submit, refresh, and retry actions
- repeated similar prompts or actions at machine cadence
- repeated retries against the same endpoint or workflow
- jumping directly into high-value actions without normal reading, scrolling, hover, or dwell behavior
- combining observation, reverse engineering, and live experimentation inside the same logged-in session
- opening DevTools-like environments together with page runtime mutation
- bulk scraping, deep pagination, or repeated background polling on logged-in pages
- mixing login-state reuse with scripted interaction and response capture in the same session

## bb-browser Guidance

When working with `bb-browser` on China mainland platforms:

- prefer snapshots, visible-state inspection, and manual confirmation over automated submission
- prefer pure CDP network observation over page-level JS injection
- prefer one stable browser profile and environment; avoid unnecessary shifts in IP, device characteristics, timezone, locale, font set, or hardware-exposed browser traits
- prefer operating-system-level keyboard and pointer events over CDP-dispatched input events
- if keyboard interaction is sufficient, use system keyboard events instead of CDP `Input.dispatchKeyEvent` or similar browser-level synthetic input
- use CDP-dispatched click or pointer events only when precise element targeting is required and a system-level event would be too unreliable
- avoid repeatedly reopening the same page or rebuilding the same session state during experiments
- avoid perfectly regular delays; if human-in-the-loop interaction is expected, leave room for real reading and dwell time
- avoid starting with submission, scraping, or capture before establishing normal user-context behavior when that context normally exists
- avoid patching page globals unless the user explicitly accepts the risk
- avoid aggressive loops, repeated refreshes, and back-to-back prompt submissions
- avoid mixing reconnaissance, hook testing, and production-account usage in one live session
- avoid assuming a single signal is decisive; expect multi-signal scoring across page runtime, behavior timing, login state, device fingerprint, and account graph
- avoid using the same account for experimentation and daily use
- treat logged-in consumer accounts as high-risk assets

## What To Say Before Risky Work

Before using a risky method, state:

- why the safer method is insufficient
- which exact detection signals the new method introduces
- whether the method touches page runtime, input behavior, or login state

Keep this explicit. Do not bury the risk in a long explanation.

## After An Incident

If an account gets flagged, restricted, or banned:

- stop further automated interaction on that account
- preserve the exact technique used
- identify which signals were observable by the page and which were only local
- record whether the site was China mainland or not
- update this skill with the new pattern so future work starts from the stricter baseline

## Non-Goals

This skill is not a bypass guide.

Its purpose is to reduce avoidable risk, force explicit tradeoffs, and keep future `bb-browser` and web automation work conservative on China mainland platforms.
