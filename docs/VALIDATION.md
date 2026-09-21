# Initial-release validation — 2026-09-21

## Verified in the implementation environment

- TypeScript strict type check passed.
- 69 unit tests passed, including story selection, routing fallback/context limits and unified code parsing.
- Ten browser workflow tests passed: visible insertion/deletion diffs and accept/undo, unified workspace, sidebar collapse and prompt settings, refusal of stale proposals after manual edits, desktop layout overflow, and cross-topic follow-ups preserving pinned context, request history, pending revisions and accepted code. The cross-topic test uses a mocked desktop provider; actual model interpretation of mixed questions remains a live acceptance check.
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

## Selective branch integration

Ported useful story-bank schema/editor/selection and routing-model support from `claude/turn-taking` at `9a523e7` (which includes `claude/human-voice`). Adapted unified code-block parsing and spoken-delivery guidance, preserving main's DSA practice controls, proposal-to-proposal baseline, rejection cancellation, and bounded wait handling. Kept the structured answer payload; changing it to prose had no measured quality benefit.

Corrections during integration: routing context is compacted before IPC to match schema limits; latest utterance remains intact. The provider retains a 1000-token budget and finalization schema instead of the branch's 16-token limit. Story selection excludes technical prompts, keeps facts for common follow-ups, and recognizes new behavioral topics. Code parsing refuses incomplete/empty final source blocks and leaves earlier examples and non-code fences visible. Old settings gain defaults. The settings UI accurately states which personal fields are sent to the provider.

Independent review identified three defects (new behavioral questions inheriting prior stories, missed personal failure/challenge phrasing, empty final source blocks falling back to earlier examples). Each was reproduced with a failing test, corrected, and verified. Browser tests additionally verify story settings persistence with legacy fields and multi-block code rendering/acceptance. No new live Windows/provider validation was possible here.

Deliberately not imported: automatic interruption/resume based on keyword classification, duplicate diff UI, automatic story-rotation state, or the wholesale persona replacement. These would need additional lifecycle or quality validation and could replace the recently verified behavior.

## Automatic DSA narration

Prompt version 2.3.0 makes paired writing/speaking guidance the default on normal DSA turns. Dry runs include state changes and matching first-person narration; implementation includes narration cues in writing order. Practice buttons remain optional. This is a prompt-only behavior change; automated tests verify application regressions, not live model adherence. Actual fluency and pacing require live acceptance with the configured model.

## Conversation and explanation display

The main answer panel now renders the session's exchanges in chronological order, with sidebar navigation and a Latest response shortcut. Historical answers retain their code inline; the latest implementation remains in the code workspace. The existing session limit is unchanged: the opening exchange and 29 recent exchanges are retained. Cross-launch history requires “Remember sessions on this device” in Settings; unsaved past sessions cannot be recovered.

GFM renders dry-run tables as real tables. Spoken guidance uses a visually separate “Say this” card. DSA prompts request complete, immediately usable narration rather than offering it in a later response. Routing and answer prompts explicitly include direct greetings and check-ins. These prompt changes still require live-model evaluation.

Validation: 69 unit tests, 12 browser workflows, TypeScript checks and the production build. New browser coverage checks spoken/table rendering, narrow-panel overflow, retained exchanges, repeated sidebar navigation, the latest-response shortcut and loading saved conversations. Provider and desktop I/O are mocked.

## Candidate identity and interview pacing correction

Prompt 2.5.0 explicitly treats incoming questions as interviewer turns and keeps candidate voice across social and technical conversation. It distinguishes a problem assignment from authorization to code, requires a title-only problem clarification to end the response, and scopes automatic narration to the current step. Few-shot examples show clarification, requirements confirmation, approach, implementation consent, explicit fast-track requests and changed constraints. Earlier helper-style responses are not examples to imitate.

Validation uses existing unit tests, type checking/build and the practice browser flow for integration regressions. These do not measure model adherence. TESTING.md contains the live conversational acceptance sequence, including the reported Two Sum reproduction. No live provider calls were made for this correction.

## Statement-first interview behavior

Prompt 2.6.0 replaces familiarity claims and title-based assumptions with a request for the actual statement. Partial statements receive a targeted question; complete statements and pinned context are reused without repetition. Examples cover changed variants, an interviewer still explaining, and explicit requests for a standard implementation. The normal flow remains adaptive rather than a fixed questionnaire. Existing integration checks verify compatibility; the updated live acceptance sequence in TESTING.md is needed to evaluate actual model behavior. No live provider evaluation was performed here.
