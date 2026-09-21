# Initial-release validation — 2026-09-21

## Verified in the implementation environment

- TypeScript strict type check passed.
- 37 domain/service/lifecycle/context/transcription/speech tests passed.
- Six browser workflow tests passed: visible insertion/deletion diffs and accept/undo, unified workspace, sidebar collapse and prompt settings, refusal of stale proposals after manual edits, desktop layout overflow, and cross-topic follow-ups preserving pinned context, request history, pending revisions and accepted code. The cross-topic test uses a mocked desktop provider; actual model interpretation of mixed questions remains a live acceptance check.
- Production renderer/main/preload build passed.
- Source formatted with Prettier.
- Independent read-only code review completed. Its three substantive findings were fixed: cancellation before asynchronous request admission; release of local audio on terminal stops; and flushing the outgoing session's history snapshot.
- Replaced the React Monaco wrapper with explicit editor/model ownership after browser tests exposed an editor-disposal error. The acceptance/undo browser test now also asserts there are no page errors.

Browser tests ran using Playwright 1.63.0 with locally available Chromium headless shell 134. The environment could not download the default current Playwright browser. CI uses the browser supplied by its pinned Playwright dependency. A large-bundle warning remains because the desktop package bundles Monaco locally; the build succeeds and requires no editor CDN.

## Not verified here

- Real paid OpenAI generation/transcription: no user API key was provided.
- Physical Windows loopback/microphone capture, permission ordering and device changes: this runtime is Linux.
- Windows installer execution or publisher code signing.
- End-to-end interruption latency and transcript quality on actual meeting audio.

These are release acceptance items in TESTING.md. This is tested initial-release source, not a certification of enterprise production readiness. The scope is a single-user desktop application; organizational controls were not part of the approved first release.

## Transcription startup correction

Changed the new-install default to `gpt-4o-mini-transcribe` for the existing server-VAD flow. Existing saved settings are retained and must be changed explicitly. Mock WebSocket tests cover configuration rejection, HTTP authentication rejection, network errors and acknowledgement before readiness. Provider diagnostics expose error codes and parameter names, not raw error messages. These tests do not establish live API connectivity or model access for a user account.

## Automatic conversational responses

Replaced keyword question detection with a model decision (`answer`, `wait`, `ignore`). Deterministic tests cover fragment accumulation, retained spoken context, automatic short replies, ignored speech, invalid decisions and cancellation on new speech or stop. A browser integration test emits transcripts and verifies automatic answers plus clarification context without clicking Generate. Its model decisions are mocked. Live decision accuracy, speaker ambiguity and end-to-end latency still require actual audio and API access.

## Mid-answer interruptions

The speech router decides whether transcribed speech deserves a response. It does not
decide what an approved utterance means for an answer already streaming, so that case is
classified separately: a correction rewrites the open turn, a short question about the
answer is treated as a detour and the interrupted answer resumes from its prefix
afterwards, and anything else opens a new turn with the interrupted one marked.

Resuming is deliberately available only for a detour. Continuing an answer whose premise
the interviewer has just withdrawn would keep writing something already rejected.

A request now records the turn it renders into, separate from its own id, so a resumed
answer continues the entry it was cut off from instead of opening another.

An earlier version of this branch also assembled utterances and filtered backchannel.
Both are now handled by the speech router and were removed rather than merged, to avoid
two turn-detection systems in the same file.

The reconnect budget resets on a confirmed session; it was cleared only in `start()`, so
three drops spread across a long sitting ended listening.

43 unit tests, browser tests, strict type check, production build and Prettier pass.
Classifier behaviour on real accented speech and live resume quality remain acceptance
items in TESTING.md.

## Spoken-register refinement

- `splitAnswer` now derives the spoken transcript and the code proposal from one pass.
  They were previously produced by two regexes that disagreed: a brute-force-then-optimal
  answer proposed nothing and had _both_ blocks stripped from the transcript, which told
  the user to look in a workspace the code had never reached. The last block tagged with
  a programming language is the proposal; earlier blocks and untagged output fences stay
  inline where they were said.
- The prompt was rewritten for spoken delivery. Topic guidance is now conditional rather
  than three unconditional personas concatenated on every turn, and explicit delivery
  rules forbid headings, bold labels, nested lists and warm-up phrases.
- The turn sent to the model is prose instead of `JSON.stringify(...)`. A model handed a
  data structure answers like one; empty sections are omitted entirely.
- 50 unit tests, 6 browser tests, strict type check, production build and Prettier pass.

Not verified here: whether answers actually sound more natural from a live model, which
needs a real key and a listener. Prompt-quality claims are unproven until item 9 in
TESTING.md is run with audio.

## Candidate persona as the system instruction

The user's Amazon SDE interview persona is now the system instruction, stored verbatim in
`src/shared/candidate-prompt.ts`. It replaces the previous hand-written topic guidance
rather than stacking on top of it, since both covered delivery and would have contradicted
each other.

Three things are appended because the persona does not cover them and the app needs them:

- Session framing. Questions are mixed and a topic change does not reset the session.
- Rendering. Answers are shown as text and code goes to a separate editor, so no headings
  or nested lists, and **the last fenced block is the workspace proposal**. Without this
  the persona would still answer well while the editor received the wrong file.
- Boundaries. Prompt-injection resistance, no invented experience, no execution tools.
  Placed last so they are the most recent thing the model reads.

The candidate's name is a setting, not source. `AGENTS.md` forbids committing personal
details, and a blank name expands to "the candidate" so the opening sentence still reads
correctly.

The assembled instruction is roughly 4,500 tokens and is sent on every turn.

60 unit tests, 6 browser tests, strict type check, production build and Prettier pass.

Not verified here: whether answers actually follow the persona. That needs a live key and
a listener, and is the acceptance item this repo has never been able to close in CI.

## Story bank

Behavioural experience moves from one free-text blob to structured stories with STAR
parts, leadership-principle tags, keywords and failure/conflict flags.

Selection is local, keyword-based and deterministic. It runs between the interviewer
finishing and the answer starting, so a network round-trip or a second model call would
be the wrong tool, and it keeps behaviour identical in tests and in an interview.

Three things this buys that a blob could not:

- Only the two closest stories are sent, instead of the whole bank on every turn.
- A coding question sends no stories at all, so the bank stops appearing in DSA turns.
- Stories already told this session are outranked, so RULE 5's "avoid repeating a story"
  becomes enforceable. A story is only reused when nothing else genuinely fits, which is
  correct: reusing the one failure story beats answering a failure question with a story
  about something else.

`refreshSettings` now parses the payload through the schema rather than trusting it. A
settings object from an older vault has no `stories` key, and the renderer was assigning
it straight into state, so selection crashed on undefined. Caught by two browser tests
that stub settings directly; fixed in the hook rather than in the tests.

77 unit tests, 6 browser tests, strict type check, production build and Prettier pass.

Not verified here: whether selection picks the story a human would have picked. That
needs real stories and a real interview.

## Routing cost and latency

The speech router ran on the answer model and received the full conversation history on
every speech pause, to return one of three words. Measured mid-interview at 12 answered
turns, one routing call carried about 15,075 input tokens; a 20-question interview with
roughly three pauses each is about 900,000 tokens spent on routing, against roughly
260,000 on the answers themselves.

Three changes:

- A dedicated `routerModel`, defaulting to a small model. If the account cannot use it,
  the provider retries once on the answer model rather than letting listening fail. Only
  a model rejection triggers that retry, so a rate limit does not silently spend a second
  call on the expensive model.
- The routing payload is the last exchange, not the interview. The tail of the last
  answer is kept because a clarifying question sits at the end of it.
- `max_output_tokens` 1000 to 16. It returns one enum value, and the old budget let a
  reasoning model spend the whole allowance before emitting it.

Measured result: about 1,075 input tokens per routing call, a 93% reduction, and on a
small model rather than the frontier one.

`speechRequestSchema` now caps the routing payload well below the answer payload, so the
history cannot silently regrow into it. A test asserts routing stays under an eighth of
the answer payload.

88 unit tests, 6 browser tests, strict type check, production build and Prettier pass.

Not verified here: the actual latency saved. That needs a live key; the token measurement
above is arithmetic on real payload sizes, not a timing measurement.
