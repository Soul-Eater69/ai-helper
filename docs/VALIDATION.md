# Initial-release validation — 2026-09-21

## Verified in the implementation environment

- TypeScript strict type check passed.
- 28 domain/service/lifecycle/context/transcription tests passed.
- Five browser workflow tests passed: visible insertion/deletion diffs and accept/undo, unified workspace, sidebar collapse and prompt settings, refusal of stale proposals after manual edits, desktop layout overflow, and cross-topic follow-ups preserving pinned context, request history, pending revisions and accepted code. The cross-topic test uses a mocked desktop provider; actual model interpretation of mixed questions remains a live acceptance check.
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

## Continuous turn-taking — added after initial release

- Utterance assembly and interruption routing added as pure, clock-injected logic in
  `src/shared/turn-taking.ts`; 13 tests cover fragmented speech, the four interruption
  classes, and the resume prompt.
- Full suite after the change: 41 unit tests, 5 browser workflow tests, strict type check,
  production build and Prettier all pass.
- The reconnect budget now resets on a confirmed session, so intermittent drops across a
  long sitting no longer exhaust it cumulatively.

Not verified here: how the classifier behaves on real accented speech, real interruption
timing, and whether resumed answers read seamlessly from a live model. Those remain live
acceptance items — items 3, 5 and 9 in TESTING.md now also cover backchannel, detour and
correction handling.
