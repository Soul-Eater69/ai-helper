# AI Helper — Windows workspace

Approved in conversation: Windows desktop, single-user, own OpenAI key, LLD/DSA/Amazon behavioral modes, natural text responses, continuous meeting audio, reviewable code revisions, local history. User authorized implementation and pushing to Soul-Eater69/ai-helper.

## Product

An explicit listening control captures system audio (including Zoom playback) or microphone for practice. Transcript, answer, and code occupy resizable-feeling responsive columns. No meeting bot or Zoom OAuth is required. System audio is device-wide, not isolated to Zoom. This is for practice and meetings permitting AI assistance.

## Boundaries

Electron main owns credentials, outbound OpenAI requests, disk storage and capture permission. A sandboxed renderer gets a narrow typed IPC bridge. React owns presentation, transcript assembly and an editor with Monaco's diff view. Audio is PCM16 mono at 24 kHz, streamed over a main-process WebSocket to OpenAI Realtime transcription. The Responses API streams text. Configuration exposes model IDs because account availability differs.

## Behavior

LLD progresses through scope, requirements, entities, implementation and edge cases; DSA through clarification, approach, code and tests. Behavioral drafts use only user-supplied facts, STAR plus learning, never invented metrics. Editable versioned mode prompts and shared style instructions control tone. Each new request cancels the preceding one; request IDs prevent stale output reaching a newer answer. History is bounded. Follow-up code is a complete replacement proposal anchored to the exact editor version; accepting stale proposals fails safely. Accept/reject/undo remain explicit. No generated code is executed.

## Reliability and privacy

Schema-validated IPC, renderer isolation, restrictive content policy, navigation blocked, no renderer API keys. Windows encrypted storage protects credentials, profile and saved sessions. Storage writes are serialized and atomically replaced. No raw audio retention. User can delete saved sessions and key. Reconnect has a finite retry budget; audio during reconnection is dropped and surfaced, never silently replayed. Provider failures and incomplete output never become accepted code. Local session persistence is opt-in. Public repository contains no personal résumé/stories or credentials.

## Acceptance

Core tests cover stale edits, undo, fragmented SSE, cancellation, transcript order and duplication, prompt grounding, validation and persistence. Browser tests exercise setup, modes and code review using a clearly labeled local demo. Type checking and a production bundle must pass. Windows CI builds an unsigned installer. Real microphone/system audio, actual paid API calls and signed installer verification require Windows hardware and an API key; report these limits honestly.
