# Streaming session execution plan

Approved design: overlap response preparation with contextual turn routing, with no query-specific shortcuts. Keep drafts hidden until confirmed. Preserve manual code proposals and cancellation before/after async setup.

1. Main SessionController owns foreground and at most one hidden draft. Compare the complete request, settings and credentials at commit. Cancel/expire stale drafts. Tests cover delayed setup, late events, changed context, failed drafts and duplicate commits.
2. SpeechQueue prepares after a finalized transcript settles, concurrently with routing; cancels on continued speech, ignore, errors and stop. Retain a draft across the bounded final routing check. Expose an early-preparation setting and narrow validated IPC.
3. Batch renderer deltas, measure first paint and provider phases, remove query-specific routing shortcut. Deduplicate identical code blocks in provider history only, preserving explanations and user constraints.
4. Run unit/type/build/browser checks and one independent final review. Document actual validation and live limitations.

Ruling: Keep the existing transcription provider and VAD until recorded-audio evaluation establishes a replacement is better. Parallel preparation removes the blocking router dependency without an unverified Windows audio runtime change.
Ruling: Do not use an LLM-generated rolling summary in this release; preserve original statements and deduplicate exact artifacts only. This avoids silently changing requirements. Broader context compression needs a separate quality evaluation.
Ruling: Use existing OpenAI SDK, Zod and native AbortController; no extra framework is needed for a bounded desktop session coordinator.

Progress: implementation started on isolated integration branch integrate/dsa-main, baseline 4d8ad0d. No application edits before controller regression tests.

Completed: controller, parallel routing/preparation integration, rollback setting, code deduplication, stable cache boundary, bounded UI delta batching and provider/render diagnostics. Speculation starts from provider-final transcripts, not partials. Independent review found no critical/important findings. 146 unit tests passed; typecheck passed. Browser tests were attempted but could not launch because the Playwright Chromium executable is absent. No live API or Windows microphone claims.

Ruling: Add a six-starts-per-30-seconds preparation limit and 30-second draft expiry. This bounds speculative churn; its trade-off is sequential generation during sustained rapid turns. Authorized answers remain available.
