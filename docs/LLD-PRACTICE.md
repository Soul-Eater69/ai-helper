# Conversational LLD practice

Prompt 2.13.0 adds LLD guidance automatically within the existing mixed-topic conversation. No separate mode or stage selector is required.

The flow is: clarify one consequential point and wait; summarize confirmed requirements, exclusions and proposed assumptions; explain a core user action; derive responsibilities, state and methods; explain and implement when requested; validate with concrete object state changes. Interviewer redirects can skip stages. A clarification, review or class sketch must not propose replacement source code.

Spoken explanation uses the existing Say this blocks. Requirements and class notes remain separate, with planning interfaces in pseudocode. The existing visual notebook represents object relationships and method walkthroughs using graph nodes and full state snapshots. Diagrams and notes are model-generated manual reasoning, not execution results.

## Manual model acceptance scenarios

Use a fresh conversation and verify the behavior with the configured provider:

1. “Design an Amazon Locker system.” Expect a brief understanding and one scope question, then stop. No code or invented interviewer reply.
2. Answer the pending question. Expect the answer to be retained and the next consequential missing question, not repeated scope questions. A garbled response must not resolve a pending requirement.
3. “Use your judgment, keep it simple.” Expect labeled assumptions, a copyable scope summary and progress. Exact size matching and expiry duration must not be silently treated as confirmed.
4. Give a complete scoped design request. Expect it to skip redundant clarification and explain the core flow before deriving classes.
5. Ask why token expiry and occupancy are separate. Expect a direct concrete explanation without rebuilding the whole design or proposing code.
6. Request pseudocode or class interfaces. Expect display-only pseudocode, not a source-code proposal.
7. “Implement it now.” Expect an approach explanation followed by one complete commented implementation using agreed requirements and the selected language, without another approval question.
8. Ask for an expired-code walkthrough with an established expiry policy. Expect concrete timestamps, lookup, comparison, rejection and unchanged occupancy, with a visual at each step.
9. Change a requirement. Expect the affected design decision to change; code only when requested. Preserve unrelated manual edits.
10. Switch to parking-lot design, then to an algorithm question. Expect no locker assumptions to carry over and the appropriate topic guidance to apply.

Automated tests cover prompt integration, planning/proposal separation and visual display with fixed example outputs. They do not measure live-model compliance with these scenarios or native audio behavior.

## Depth and pacing regression: locker replacement

Replay the supplied sequence: one location, exact match, expiring code, replacement, customer, package ID, package ID alone is enough. The next answer must accept the settled verification simplification and proceed. Do not ask again whether to add another verification detail. If a validity duration was not supplied, explicitly propose a configurable duration instead of silently choosing seven days.

Expect a reason for every stored lookup and responsibility. A valid design can use one deposit record referenced by package ID and current code, or another justified representation. It must explain duplicate active package handling, what happens when code generation fails, why expired codes leave occupancy unchanged, and why pickup/replacement cannot succeed after collection. Previously issued codes must not later reopen an unrelated deposit through identifier reuse.

Before asking to implement, show an end-to-end example exercising expiry and replacement, including rejection of the old code and successful pickup with the new code. Keep object positions stable and show concrete changes. Do not repeat that entire trace after coding; validate a different meaningful case against the actual implementation.

These are live-model acceptance checks, not claims of automated semantic validation.

## Live requirements panel

The sidebar now shows Requirements and Out of scope from the start of a session. Each completed LLD answer supplies a validated full snapshot in a display-only requirements fence. New and corrected bullets briefly highlight; Copy notes copies the current board as plain text. Proposed assumptions stay in chat until agreed. The final clarification should review the already accumulated notes instead of making the user write them again.

Cancelled, streaming and malformed snapshots never replace the last valid board. Explicit new-question transitions clear it immediately; a new topic snapshot replaces it. New sessions clear it, and saved conversations reconstruct their notes from completed answers. Earlier answers retain their snapshots in conversation history. This feature uses the existing answer request, not an extra model call. Model omission or incorrect extraction remains possible and needs live practice validation.
