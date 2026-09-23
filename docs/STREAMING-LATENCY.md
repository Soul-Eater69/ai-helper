# Streaming response preparation

Spoken turns use the same contextual answer/wait/ignore decision, without greeting or question-specific bypasses. Once a provider-final transcript is available and no later utterance is active, the session starts one hidden answer alongside the routing request. It does not speculate from unstable partial transcripts. The extra renderer 350 ms debounce is removed in the live integration; provider VAD remains unchanged.

The router still decides whether to publish. Continued speech, ignored speech, errors, stop/reset or expired preparation discard the draft. A wait preserves the draft during the bounded final routing check. Pausing capture still drains the audio tail before finalizing the question. Pausing capture does not cancel an already published answer.

The main-process SessionController owns generation. Commit compares the entire request, code/version, history, settings and key before reusing a draft. Changes cause fresh generation. Preparation never emits UI events. Only complete, current responses can produce the existing manually accepted code proposals.

## Bounds and fallback

- At most one hidden draft and one foreground response per app session.
- Draft lifetime: 30 seconds, including asynchronous setup.
- At most six speculative starts per rolling 30 seconds; authorized answers are not throttled by this limit.
- Existing answer length, timeout, abort and IPC schema limits remain in force.
- A failed/expired/throttled draft falls back to normal generation after approval.
- Settings → **Prepare replies early** disables speculation for comparison. It is enabled by default and can spend tokens on discarded drafts.

## Context and rendering

Provider history replaces exact duplicate implementation blocks with references to the current code or later retained implementation. User statements and surrounding explanations are unchanged. This is not semantic summarization: no requirements are inferred, merged or removed. The existing history cap still applies.

For `gpt-5.6-sol`, a developer input block carries the existing guidance unchanged, with an explicit cache boundary and explicit cache mode supported by the installed SDK. Other model IDs retain their prior instruction request format. Cache hits must be verified from actual usage; no hit or latency benefit is assumed. Reusing the SDK client does not prove transport connection reuse.

Renderer deltas are batched over 32 ms. Completion replaces buffered text with the authoritative full response. Cancellation flushes received text and discards later events. Unchanged answer content is memoized.

## Measurement

Export diagnostics after testing the same prompts with early preparation on and off. Logs include conversation text, so review them before sharing.

- `router.start.answerId` links routing to the prepared/committed response; `routeId` distinguishes attempts.
- `provider.start`, `provider.connected`, `provider.first_delta`, `provider.completed` report model/configuration, phase durations, context sizes and completed-response token/cache usage.
- `session.prepare`, `session.commit`, `session.discard`, `session.preparation_limited` show speculation, reuse and wasted generated characters. Cancelled calls may not expose final billed token usage.
- `renderer.answer.received` and `renderer.answer.painted` separate IPC receipt from a post-React-commit paint opportunity. The latter is a two-animation-frame approximation, not an OS presentation measurement.
- Existing transcript, speech-stop, capture and heartbeat events remain available.

Compare p50/p95 first visible response latency, missed/early answers, stale outputs and cost. Do not add independent stage percentiles. A speech-stop event arrives after the provider's endpointing delay, so it is not the true acoustic end timestamp.

## Evaluation boundaries

A deterministic test overlaps a 1000 ms router with a 1200 ms answer: first text arrives at 1200 ms after scheduling rather than their 2200 ms sum. This proves overlap only. Provider latency, Windows microphone behaviour, speech accuracy, prompt caching and natural answer quality require live evaluation.

Turn-detector replacement and automatic rolling summaries are deliberately deferred. Introducing a new audio runtime or lossy requirements summary without recording-based evaluation would obscure the benefit and risk correctness. This release uses the existing SDK, Zod, AbortController and React; no additional voice framework is required.
