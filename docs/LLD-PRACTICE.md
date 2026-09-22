# Conversational LLD practice

Prompt 2.11.0 adds LLD guidance automatically within the existing mixed-topic conversation. No separate mode or stage selector is required.

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
