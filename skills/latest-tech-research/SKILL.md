---
name: latest-tech-research
description: Research time-sensitive facts and technical choices with live web data. Use when the user asks for the latest/current/today/recent information, release or version status, recommendations that depend on what exists now, or technical selection across libraries, frameworks, APIs, models, vendors, or services. In those cases, use the local `grok-search` CLI first, prefer official docs and primary sources for technical claims, and cite concrete dates when freshness matters.
---

# Latest Tech Research

Use this skill when the answer depends on information that may have changed recently or when the user wants a recommendation among current technical options.

Default toolchain for this skill:

1. Use the local `grok-search` CLI for broad discovery and high-freshness research.
2. Use official docs, GitHub repositories, release notes, or vendor pages for verification.
3. Only fall back to other search methods if `grok-search` is unavailable or clearly insufficient for the task.

## Trigger Cues

- "latest", "current", "today", "recent", "newest", "up-to-date"
- "should I use X or Y", "tech selection", "evaluate", "compare", "recommend"
- framework, library, model, API, vendor, pricing, release, compatibility, maintenance status

## Workflow

1. Start with `grok-search`.
   - Prefer the local `grok-search` CLI, not a generic browser search flow.
   - Use it for the initial broad scan, then refine with narrower follow-up queries.
   - Use normal readable output during exploration; use `--json` only when another tool or script explicitly needs machine-readable output.
2. For technical claims, verify against primary sources before concluding.
   - Prefer official docs, release notes, vendor docs, standards, or repository sources.
   - Treat secondary summaries as supporting context, not final authority.
   - Once strong candidates emerge, switch from broad search to direct source inspection with repository pages, official docs, or release notes.
3. When freshness matters, include concrete dates.
   - Avoid vague relative wording when a date clarifies the answer.
4. For technical selection, compare the options on current reality.
   - Maintenance and release activity
   - Documentation quality
   - API or ecosystem fit
   - Cost or lock-in
   - Migration risk
   - Evidence quality behind performance claims
5. Make a recommendation when the user asks for one.
   - Do not stop at a neutral comparison if a recommendation is requested.
   - Separate verified facts from your judgment.

## Output Guidance

- Keep the answer concise, but include links when they matter.
- Mention the key `grok-search` queries you used when they materially support the result.
- Distinguish verified facts from your own recommendation or inference.
- Call out uncertainty if the source picture is mixed.
- If `grok-search` fails, say that explicitly and fall back to the best available primary documentation.
