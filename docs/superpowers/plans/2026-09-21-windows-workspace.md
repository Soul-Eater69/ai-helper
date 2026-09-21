# Windows Workspace Implementation Plan

> Execute inline using superpowers:executing-plans; review the complete branch once before pushing.

**Goal:** Ship the approved Windows interview workspace source and build workflow.
**Architecture:** Electron privileged process handles OpenAI and encrypted storage. Sandboxed React renderer captures selected audio and reviews answers/code through a narrow IPC API.
**Tech Stack:** TypeScript, Electron, React, Vite, Monaco, OpenAI SDK, ws, Zod, Node tests through Vitest, Playwright.
**Spec:** ../specs/2026-09-21-windows-workspace.md

## Global constraints

- Windows desktop, single user, own API key, no personal facts committed.
- Audio capture is explicit; system loopback is device-wide.
- AI code is a proposal, never an automatic editor write.
- Provider requests and secrets are main-process only.

## Review focus

- An edit during generation must prevent accepting a stale replacement.
- A canceled response must not overwrite a newer answer or become accepted code.
- Out-of-order transcripts must retain committed item order and be deduplicated.
- Failed or denied audio setup must release tracks and leave an actionable state.
- Invalid storage or IPC must fail safely without exposing keys.

## Task 1: Domain contracts and invariants

Files: src/shared/{contracts,revision,prompts,transcript}.ts; tests/domain.test.ts.
Interfaces: Settings, AnswerRequest, AppEvent, DesktopAPI; propose/accept/undo code operations; TranscriptBuffer.

- [x] Write tests asserting stale `acceptRevision` throws and `undoRevision` restores exact text, then run `npm test` and observe the missing module failure.
- [x] Implement immutable revision functions with integer versions and bounded undo history; compile mode prompts with data separated from instructions.
- [x] Test transcript final-event duplication and ordering by committed predecessor IDs; implement bounded transcript assembly.
- [x] Run the whole test suite and commit the core.

## Task 2: Main process and audio transport

Files: src/main/{index,storage,assistant,transcription}.ts; src/preload/index.ts; src/renderer/audio/capture.ts; public/pcm-worklet.js; tests/services.test.ts.
Interfaces: DesktopAPI methods invoke validated IPC; only AppEvent crosses to renderer. AssistantService accepts an injected streaming provider for cancellation tests.

- [x] Test stream cancellation, failure/incomplete responses, oversized input and serialized persistence before implementing these behaviors.
- [x] Implement encrypted atomic local storage, restrictive BrowserWindow permissions, explicit system capture grant, safe errors, narrow preload API.
- [x] Implement transcription session acknowledgement, chunk backpressure, finite reconnect and item ordering.
- [x] Build a 24 kHz AudioWorklet capture pipeline with cleanup on every failure path; run all tests and commit.

## Task 3: User workspace

Files: src/renderer/{App,main,styles,bridge}.tsx/ts/css and components/{AnswerPanel,CodeWorkspace,SettingsDialog,TranscriptPanel}.tsx; hooks/useSession.ts; tests/ui.spec.ts.
Interfaces: request IDs and editor versions connect answers to reviewed proposals; Settings excludes the key on read.

- [x] Write browser tests for onboarding, mode switching, demo response, accepting and undoing code, stale-proposal refusal and settings persistence.
- [x] Implement accessible keyboard-friendly layout, stage controls, transcript editing, streaming markdown, Monaco editor/diff, history selection and draft settings.
- [x] Provide an explicitly labeled offline demo using synthetic examples and no API calls.
- [x] Run typecheck, unit tests, browser tests and production build; inspect screenshots at desktop and narrower widths; commit.

## Task 4: Release and verification

Files: README.md, SECURITY.md, docs/TESTING.md, .github/workflows/ci.yml, package.json, scripts/build.mjs.

- [x] Document Windows install/start/package, API billing, audio scope, model settings and troubleshooting.
- [x] Add Linux checks and Windows packaging workflow, with explicit unsigned-installer status.
- [x] Review branch with a fresh reviewer; repair substantive findings and rerun checks.
- [x] Push through the GitHub connector and verify remote files/commit. Record Windows/API validation limitations.
