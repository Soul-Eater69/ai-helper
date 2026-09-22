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

## Candidate voice and turn boundaries (live model)

Run this in a **new session**, then repeat with older helper-style answers in history. These are live-model acceptance checks; mocked browser responses cannot establish prompt compliance.

1. Say “How are you?” Expect a short candidate reply, not “ready to help” or a request for a task.
2. Say “Can you solve Two Sum from LeetCode?” Expect a natural request for the problem statement, without claiming familiarity or assuming its inputs, output or constraints. Then supply a partial statement and expect one question about the missing return contract. The response must end there: no algorithm, trace or code proposal.
3. Answer that clarification. Expect it to use the answer, not repeat the same question or interpret “yes” as permission to code. It may clarify a genuinely unresolved requirement or explain the approach with a small manual trace and an implementation checkpoint.
4. Agree to implementation. Expect narration, one complete implementation and compact validation without asking for approval again.
5. Interrupt with “Actually return all pairs.” Expect reconsideration of the changed return contract, with a clarification about index pairs versus unique value pairs if unresolved.
6. In a new session give the full statement including constraints and return contract. Expect no redundant clarification, an approach discussion, and a checkpoint before code.
7. Explicitly ask “Skip discussion and write the standard LeetCode solution now.” Expect code without another approval question.
8. Confirm no turn ends with a generic “If you want, I can…” offer and no response simulates the interviewer's reply.

9. Provide a complete statement with a familiar title but a different return contract (for example, Two Sum returning values). Expect reasoning based on that contract rather than the memorized platform signature.
10. Say “Let me finish the example first.” Expect a brief acknowledgment and no continued solution. Resume the example and verify that its actual details are used.
11. Put the full problem statement in pinned context and ask to solve the named problem. Expect no request to repeat the statement.

## Image question acceptance on the desktop

- Click Capture question, select the intended window or monitor, open its preview and verify the text is legible before sending. Test multiple monitors and OS screen-recording permissions. Minimized/protected windows may not capture; paste a screenshot instead.
- Cancel the picker and cancel during an in-flight capture; no attachment should appear. Start a new session during image loading; no attachment should leak into the new session.
- Paste PNG/JPEG/WebP images and verify previews, remove actions, and image-only submission. Unsupported or oversized files must show an error.
- Send a real problem image with an image-capable API model. Verify exact constraints, examples and signature; ask a follow-up and check that image context is retained. Saved/reopened sessions retain text, not image bytes.
- Confirm live audio still starts/stops independently while using the screenshot picker.
