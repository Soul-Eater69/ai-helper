# AI Helper

A Windows desktop workspace for technical interview practice and meetings where AI assistance is permitted. Built with Electron, React, TypeScript, and Monaco.

**Status: initial release.** The source includes a real OpenAI integration and Windows packaging workflow. Passing automated checks does not establish production readiness: live OpenAI audio and physical Windows capture still require the acceptance checks in [TESTING.md](docs/TESTING.md).

## What it does

- **One continuous session:** mixed questions use shared conversation, pinned requirements and working code, with no topic or stage selection.
- **LLD:** clarify one requirement at a time, summarize scope, derive entities, implement, and cover edge cases.
- **DSA:** explain the approach and complexity, write readable code, and work through follow-ups.
- **Amazon behavioral:** shape supplied experience into natural STAR + learning answers. Missing experience triggers a question, not an invented achievement.
- **Continuous audio:** explicitly capture system playback (including Zoom) or a microphone; stream transcripts and interpret conversational turns after a pause.
- **Reviewable code:** line numbers, syntax highlighting, inline additions/deletions, accept/reject, and undo. Editing while a proposal is generated makes that proposal stale and unapplyable.
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

For development, use `npm run dev`. Renderer edits reload automatically; restart the command after changing main/preload code.

### Audio with Zoom

1. Join a practice or permitted meeting normally in Zoom.
2. In AI Helper, choose **System audio**, then **Start listening**.
3. Play a test sentence and check the input meter and transcript before relying on it.
4. Use **Microphone** to practice by asking questions aloud yourself.
5. Pause when finished. Stopping the app stops capture.

System audio captures **all playback on the computer**, not only Zoom or an individual speaker. Use headphones to avoid feedback and stop other playback. This app does not join Zoom, bypass meeting controls, identify speakers, or modify the interview's external editor. Its integrated editor is the source of truth for code proposals; paste external changes into it before requesting a revision.

Transcription uses English settings. With **Respond to conversation automatically** enabled (the default), a model reads each paused turn and conversation context to decide whether to answer, wait for more speech, or ignore it. Questions, corrections and short answers to clarifying questions can trigger a response without clicking Generate. Incomplete turns are carried forward; new speech invalidates pending decisions. Recent spoken context and the current response help distinguish follow-ups from acknowledgements or reading an answer aloud. This adds a model request per interpreted turn, so latency and API usage depend on the selected answer model. This is text-based turn interpretation, not speaker identification or the ChatGPT Voice engine; ambiguous speech can still be misclassified. Reconnect notices identify periods where audio is dropped; repeat the question after recovery. A change of transcription model requires restarting listening.

### Transcription startup errors

If you saved settings with the earlier `gpt-live-transcribe` default, change **Settings → Transcription model** to `gpt-4o-mini-transcribe`, save, and restart listening. Saved model choices are not overwritten by updates. This app uses server voice activity detection to commit speech turns; the live model configuration can reject that setting. Startup errors now distinguish authentication, HTTP access/rate limits, configuration rejection and network failure. Provider error codes and parameter names are shown without raw provider messages or credentials.

### Listening continuously, and being interrupted

Press **Start listening** once. The session stays live for the whole interview: it keeps
one transcription socket open across every question, reconnects silently on a drop, and
never needs another click. Pausing is explicit.

The speech router decides whether what it heard deserves a response — a complete
question, a correction, or a short reply to a clarification all count, while filler,
background talk and someone thinking out loud do not. It also waits when a question is
still being formed, so a pause mid-sentence does not start a second answer.

Speech the router has approved is then routed again by what it means for an answer that
is still streaming:

| What was said                     | What happens                                                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| "what's the complexity of that?"  | Answered as a short aside, then the interrupted answer **resumes from where it stopped**. |
| "actually, return all pairs"      | The premise changed, so the answer is rewritten in place — same entry, new requirement.   |
| "okay, now design a rate limiter" | A new entry. The interrupted one is kept and marked.                                      |

Resuming re-sends what was already written and asks the model to continue from exactly
there, so nothing is repeated. A correction never resumes: continuing an answer whose
premise was just withdrawn would keep writing something already rejected.

Routing is a heuristic over the transcript, not full understanding. Turn off automatic
answers in Settings to review every transcript in the question box before sending.

### Code review

Ask a question and review the suggested explanation. The code panel opens when code is proposed and stays available once you have working code; **Pin code** also opens it at any time. Non-code follow-ups preserve pending proposals. Complete code appears under **Review changes**; green marks additions and red marks removals. **Accept changes** replaces the workspace only if its version still matches the version used for generation. **Reject** leaves your code alone. **Undo revision** restores the text from before the last accepted proposal. There is no code execution feature.

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
