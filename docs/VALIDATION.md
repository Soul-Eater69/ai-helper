# Initial-release validation — 2026-09-21

## Verified in the implementation environment

- TypeScript strict type check passed.
- 39 domain/service/lifecycle/context/transcription/speech tests passed.
- Nine browser workflow tests passed: visible insertion/deletion diffs and accept/undo, unified workspace, sidebar collapse and prompt settings, refusal of stale proposals after manual edits, desktop layout overflow, and cross-topic follow-ups preserving pinned context, request history, pending revisions and accepted code. The cross-topic test uses a mocked desktop provider; actual model interpretation of mixed questions remains a live acceptance check.
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

## Successive code revisions

Browser regression tests cover three successive implementations, both with and without accepting the first proposal. They check the code sent for each follow-up and visible removed/inserted lines in the updated diff. The original implementation failed the unaccepted-proposal test by sending the starter file as the second request baseline. The corrected flow uses the latest proposal only while its working-document version remains valid. Manual edits retain precedence and stale-accept protection.

## Bounded speech waiting and visible changes

A wait decision now schedules one final interpretation after another 1.5 seconds of silence; the final provider schema allows answer or ignore only. New speech and pause cancel the pending recheck. Tests verify that answering resumes without another utterance. The code diff shows changed-region position and inserted/deleted line counts, with previous/next navigation.

## Adaptive DSA practice

Prompt version 2.1.0 adds context-based pacing, one-at-a-time material clarification, natural candidate speech, justified optimization, manual traces, code review and interruption handling. Practice tools expose explain/dry-run/review/optimize actions without mode selection. The added browser test verifies pending-proposal and manually edited code baselines, retained question/clarification context, draft preservation, disabled controls during generation, and hiding actions on historical turns. The test failed on the missing controls before implementation and passed afterwards.

This is instruction-driven model behavior. No live provider evaluation was run for this change, and the automated test uses mocked provider responses. Real-model acceptance scenarios are in `docs/DSA-PRACTICE.md`; actual pacing and algorithm quality remain unverified. Code feedback is manual model analysis on request, not sandbox execution or continuous keystroke review.
