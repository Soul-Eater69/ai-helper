# Validation and acceptance

## Automated coverage

`npm test` covers immutable code acceptance and undo, stale proposals, complete code-fence extraction, transcript ordering/deduplication, speech interpretation lifecycle, prompt grounding, schema boundaries, interrupted generations, incomplete streams and serialized encrypted storage.

`npm run test:ui` exercises the actual browser UI with explicitly labeled sample responses. This does not exercise OpenAI or Electron permissions. Browser tests verify proposal acceptance/undo, stale revision refusal, mixed-topic context and practice actions, editable settings and viewport overflow. Screenshots are written to ignored `test-results/`.

`npm run build` typechecks and bundles the renderer, main process and sandboxed preload. CI also packages on Windows. A successful package build does not prove physical audio capture works.

## Required Windows + live API acceptance

1. Fresh install, launch and save a restricted test API key. Close/reopen; key status persists and the key is not displayed.
2. Select models available to the account. Send typed DSA, LLD and behavioral questions in one session. Confirm real streaming text and actionable invalid-key/quota errors.
3. With headphones, play a Zoom practice question while capturing system audio. Verify the meter, transcript, final answer and pause behavior. Repeat with microphone.
4. Deny/cancel capture, unplug the selected audio device, then start again. No orphan stream should remain.
5. Ask a follow-up during generation. Old output must stop; only the new request may finish.
6. Disconnect networking during audio. Confirm reconnect notice, no silent backlog replay, finite retry budget, and restart after exhaustion.
7. Edit the workspace while generating. Acceptance must be disabled for the stale proposal. Regenerate, accept, then undo and verify exact original text.
8. Enable history, finish a session, restart, reopen it and delete it. Confirm the current code and bounded completed turns survive; disabling history stops future saves.
9. Verify actual latency and transcript accuracy with realistic accents, interruptions and background playback. No fixed latency promise is made.
10. Run the unsigned installer in a clean Windows VM. For public distribution, sign and repeat the installer checks under your publisher identity.

## Release evidence

The implementation session's available automated results and limitations are recorded in `docs/VALIDATION.md`. Never treat browser demo results as live API validation.

For adaptive DSA pacing and solution-quality acceptance, use [DSA practice scenarios](DSA-PRACTICE.md). Mocked workflow tests do not establish real model compliance.
