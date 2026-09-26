# AI Helper

A Windows desktop workspace for technical interview practice and meetings where AI assistance is permitted. Built with Electron, React, TypeScript, and Monaco.

**Status: initial release.** The source includes a real OpenAI integration and Windows packaging workflow. Passing automated checks does not establish production readiness: live OpenAI audio and physical Windows capture still require the acceptance checks in [TESTING.md](docs/TESTING.md).

## What it does

- **One continuous session:** mixed questions use shared conversation, pinned requirements and working code, with no topic or stage selection.
- **LLD:** clarify one requirement at a time, summarize scope, derive entities, implement, and cover edge cases.
- **Image questions:** use Capture question to select a screen/window, paste an image into the composer, or use Add image. Preview/remove up to three attachments before sending. The latest image question stays available for in-session follow-ups; images are not saved to session history. Requires an API model with image input.
- **DSA:** explain the reasoning behind each choice, write code with a short comment on each meaningful line, and step through visual dry runs with synchronized speaking and writing notes.
- **Amazon behavioral:** shape supplied experience into natural STAR + learning answers (about 90 seconds to 2 minutes, mostly on your own actions, with the numbers you supplied). Common Amazon phrasings are mapped to the leadership principle they probe, stories already told in the session are deprioritized, and deep-dive follow-ups keep the probed story's facts. Missing experience triggers a question, not an invented achievement. Set **Experience level** in Settings so answers match your seniority.
- **Continuous audio:** explicitly capture system playback (including Zoom) or a microphone; stream transcripts and interpret conversational turns after a pause.
- **Reviewable code:** focused before/after snippets for each change, jump-to-change navigation, inline or side-by-side comparison, and explicit working/proposed copy actions. Compare successive drafts or all pending changes against working code. Accept/reject and undo stay explicit; edits made during generation make a proposal stale and unapplyable.
- **Personal prompts:** edit speaking style, real experience facts, and topic-specific guidance that applies automatically in Settings.
- **Local control:** your own API key; OS-encrypted settings and optional session history. No raw audio is retained.

The sample session is **canned, clearly labeled demo content**. It exercises the interface without credentials; it is not a live model answer.

## Run on Windows

Install Node.js **22.12 or newer** and Git. Then, in PowerShell:

```powershell
git clone https://github.com/Soul-Eater69/ai-helper.git
cd ai-helper
npm ci
npm run build
npm start
```

Open **Settings**, enter an OpenAI API key, select models available to your API account, and add your verified experience. The default answer model is configurable; the default transcription model is `gpt-4o-mini-transcribe`. Model availability depends on your account. API charges are separate from a ChatGPT subscription.

### Answer speed and quality

The default **Adaptive** answer preset keeps replies fast without giving up reasoning where it matters. Greetings, clarification answers and short follow-ups are answered with reasoning off; new coding or design problems, code changes, traces and long dictated statements get low reasoning. Early preparation starts that request on the first pause, so the reasoning usually overlaps with the pause and routing check. **Instant**, **Quick thinking** (low) and **Thinking** (medium) force one effort level. Explicit effort is sent only to GPT-5.x reasoning models; if a model rejects it, the request is retried with the model default.

Each request carries only the guidance for the topics the turn needs (DSA, LLD, behavioral, plus the visual dry-run protocol for DSA/LLD). Short follow-ups inherit the topic of the ongoing thread. The question is sent first as plain labelled text rather than JSON, and experience facts are included only on behavioral or conversational turns. Transcription receives a vocabulary hint with common algorithm and design terms and the candidate name.

For development, use `npm run dev`. Renderer edits reload automatically; restart the command after changing main/preload code.

### Audio with Zoom

1. Join a practice or permitted meeting normally in Zoom.
2. In AI Helper, choose **System audio**, then **Start listening**.
3. Play a test sentence and check the input meter and transcript before relying on it.
4. Use **Microphone** to practice by asking questions aloud yourself.
5. Pause when finished. Stopping the app stops capture.

System audio captures **all playback on the computer**, not only Zoom or an individual speaker. Use headphones to avoid feedback and stop other playback. This app does not join Zoom, bypass meeting controls, identify speakers, or modify the interview's external editor. Its integrated editor is the source of truth for code proposals; paste external changes into it before requesting a revision.

Transcription uses English settings. With **Respond to conversation automatically** enabled (the default), a model reads each paused turn and conversation context to decide whether to answer, wait for more speech, or ignore it. Questions, corrections and short answers to clarifying questions can trigger a response without clicking Generate. A wait decision gets one final interpretation after another 1.5 seconds of silence, so it does not require another utterance to resume. New speech invalidates pending decisions. Recent spoken context and the current response help distinguish follow-ups from acknowledgements or reading an answer aloud. This adds a model request per interpreted turn, plus one recheck if it initially waits, so latency and API usage depend on the routing model. Routing uses a separate configurable model (default `gpt-4o-mini`); blank uses the answer model, and an explicit model-unavailable error falls back to the answer model. Older routing context is compacted while the current utterance remains intact. This is text-based turn interpretation, not speaker identification or the ChatGPT Voice engine; ambiguous speech can still be misclassified. Reconnect notices identify periods where audio is dropped; repeat the question after recovery. A change of transcription model requires restarting listening.

### Transcription startup errors

If you saved settings with the earlier `gpt-live-transcribe` default, change **Settings → Transcription model** to `gpt-4o-mini-transcribe`, save, and restart listening. Saved model choices are not overwritten by updates. This app uses server voice activity detection to commit speech turns; the live model configuration can reject that setting. Startup errors now distinguish authentication, HTTP access/rate limits, configuration rejection and network failure. Provider error codes and parameter names are shown without raw provider messages or credentials.

### Code review

Ask a question and review the suggested explanation. The code panel opens when a new implementation is proposed. **Hide code** or its close button hides it without discarding code or pending revisions; **Show code** reopens it. Explicit transitions such as “let’s get to another question” hide the previous code panel. This is a display change, not deletion or a new session; topic changes without an explicit transition can be handled with Hide code. Non-code follow-ups preserve pending proposals. When you request another revision before accepting, it builds on the latest proposal and highlights changes since that proposal. The comparison label identifies the baseline; accepting applies the complete updated implementation. If you manually edit working code, that working version takes priority instead. Each diff scrolls to its first changed line and shows **Change 1 of N**, added/removed line counts, and previous/next change buttons. Revision answers are prompted to start with a short **What changed** explanation. Complete code appears under **Review changes**; green marks additions and red marks removals. **Accept changes** replaces the workspace only if its version still matches the version used for generation. **Reject** leaves your code alone and cancels an in-flight revision that depends on the rejected proposal. **Undo revision** restores the text from before the last accepted proposal. If an answer contains multiple source blocks, earlier examples stay visible in the explanation and the final complete source block becomes the proposal. Trace/output fences stay in the explanation; unknown, untagged, incomplete or empty final source blocks are not usable implementations. There is no code execution feature.

### Session context

Use **Requirements & context** to pin constraints throughout the session. The provider receives the opening question and recent turns within an 80,000-character history budget, plus pinned notes and current editor code. Older intermediate conversation can fall outside this budget; pin requirements that must survive a long interview. Optional encrypted history stores the notes alongside the code and answers. Existing saved sessions still open.

## Build an installer

```powershell
npm run package:win
```

The unsigned x64 NSIS installer appears in `release/`. Windows may warn because this release is not code-signed. Production distribution should use a publisher-owned signing certificate and independently verified release artifacts.

GitHub Actions runs tests/builds and builds the Windows installer. Download it from the successful workflow's `windows-installer` artifact. This is a build artifact, not an automatically published GitHub Release.

## Checks

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

`npm run dev:web` provides a browser-only UI preview; live audio, credentials, and provider calls require the desktop app. Browser preview settings are held only in memory.

## Project structure

| Directory               | Responsibility                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `src/main`              | Validated IPC, encrypted storage, OpenAI streaming, transcription socket lifecycle |
| `src/preload`           | Narrow typed bridge; no generic filesystem or network API                          |
| `src/shared`            | Schemas, prompts, transcript ordering, immutable code revisions                    |
| `src/renderer`          | Workspace, settings, Monaco review, audio capture and session UI                   |
| `public/pcm-worklet.js` | 24 kHz mono PCM16 audio conversion in an AudioWorklet                              |
| `tests`                 | Domain/service checks and browser user-flow tests                                  |
| `docs`                  | Approved design, implementation plan, validation and operating notes               |

## Privacy and limits

- Audio goes to OpenAI while listening. Questions, bounded conversation context, your current code, and experience facts go to OpenAI when generating answers.
- API keys stay in Electron's main process after entry and are encrypted using Electron `safeStorage` (Windows OS facilities). They are never returned to the renderer, logged, or committed.
- Settings and optional sessions live in `vault.bin` under Electron's user-data directory (normally `%APPDATA%\ai-helper`). Back up this file before troubleshooting damaged storage; encryption is tied to the OS user and is not a portable backup format.
- History is off by default, holds at most 50 sessions when enabled, and can be deleted individually in the sidebar. Disabling history stops future saves; delete existing sessions explicitly.
- Prompt quality cannot guarantee factual or technical correctness. Review generated content.
- This release is a single-user app. It does not implement organization accounts, SSO, managed billing, centralized audit logs, or a signed auto-update service.

See [SECURITY.md](SECURITY.md) and [validation instructions](docs/TESTING.md).

## DSA practice

DSA guidance adapts to confirmed constraints, short replies, interruptions and direct requests. It asks one material clarification at a time, explains brute force and optimization, pauses before implementation unless coding is already requested, and supports manual dry runs, edge-case review and follow-up changes. Candidate wording is automatic: dry runs pair what to write with what to say, and coding includes narration cues in writing order. No coaching command or practice-button click is required.

Open **Practice tools** below the latest response for **Explain approach**, **Dry run**, **Review code** and **Optimize**. These use the latest code and conversation without overwriting your typed draft. Reviews do not execute code or request automatic changes; ask to implement a fix when ready. Model pacing is instruction-driven, not a deterministic stage machine. See [DSA practice and live acceptance scenarios](docs/DSA-PRACTICE.md).

Visual dry runs support trees, graphs, arrays, grids and DP tables. Use **Back / Next step** to follow the changing state; open **All walkthrough notes** to read everything together. Older text tables still display normally. Diagrams are manual, model-generated traces, not executed tests. See [visual dry runs](docs/VISUAL-DRY-RUNS.md).

## Personalization and real stories

Settings now includes a candidate name and a structured **Story bank**. Add up to 20 real experiences with Situation, Task, Action, Result and Learning, optional Leadership Principle tags and keywords, and failure/disagreement flags. Existing free-text background remains available. The app selects up to two relevant stories locally and resolves their text in the main process before sending the answer request. Common follow-ups can reuse the previous question's story facts. Selection uses vocabulary matching and may miss unusual phrasing; it is not semantic retrieval and does not guarantee story variety. Give specific context when needed.

Your name, background and selected story facts are sent to OpenAI when generating answers and are stored in the encrypted local settings. No real experience data is included in this repository. Missing facts must be requested rather than invented. Spoken guidance favors natural first-person paragraphs; coding guidance includes short narration beats in writing order.
