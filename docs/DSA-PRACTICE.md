# DSA practice

The session adapts from the conversation, pinned constraints and the latest code. No DSA mode or stage selection is needed. The default is one consequential clarification at a time, a concise approach discussion (brute force, bottleneck, improvement and trade-off), a useful example and an implementation checkpoint. Coding, manual tracing, edge cases and complexity follow when implementation is agreed. Direct requests can skip or revisit steps.

The assistant drafts candidate speech. Spoken wording is supplied automatically. Each dry run pairs **Write / state** with **Say aloud**, and implementation includes short narration cues in writing order. No special coaching request or button click is required. Ask for shorter or deeper answers at any time. Behavioral and design questions can interrupt an algorithm discussion without requiring a mode switch.

**Practice tools** are optional shortcuts for revisiting a step. Below the latest response, the panel provides Explain approach, Dry run, Review code and Optimize. These send follow-ups using the existing conversation and latest valid proposal or manually edited working code. They preserve unfinished text in the composer. Code review/optimization require code; controls disable during generation. When viewing an earlier answer, return to the latest question to use the controls. The sample session uses fixed responses and does not expose these controls.

A dry run or review does not ask for a code replacement. Optimization discusses a justified improvement first; reply “implement that” for a reviewable proposal. The assistant can explain why an algorithm is already optimal. Code changes remain subject to Accept/Reject and stale-version safeguards.

## Live model acceptance script

Run this in the Windows app with your configured model. These are acceptance scenarios, not recorded passes. Start a new session for each independent problem. Check model reasoning, not exact phrasing. Provider responses are probabilistic; automated browser tests cover app behavior and context delivery, not solution quality.

| Scenario                         | Say or type                                                                                                                                        | Expected behavior                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing requirement              | “Two Sum: find two numbers adding to a target.”                                                                                                    | Ask one material question such as indices versus values; stop, no code.                                                                                              |
| Answer clarification             | “Indices.” Then answer any remaining material question.                                                                                            | Preserve the answer; never re-ask it. Once clear, explain the approach.                                                                                              |
| Fully specified familiar problem | “Return indices of the unique pair summing to target. Integers may repeat, cannot reuse an index, input is unsorted, O(n) extra space is allowed.” | Skip unnecessary questions; briefly compare quadratic search with a hash map, explain lookup before insertion, expected O(n) time and O(n) space. Pause before code. |
| Short approval                   | After an implementation checkpoint: “Yes, go ahead.”                                                                                               | Produce implementation in the selected language without asking permission again. Include concise manual validation.                                                  |
| Requested brute force            | “Show only the brute-force implementation first.”                                                                                                  | Honor it; no forced optimized implementation.                                                                                                                        |
| Dry run                          | “Dry run nums=[3,3], target=6.”                                                                                                                    | Trace the actual code; use distinct indices and show lookup/storage order. No replacement proposal.                                                                  |
| Feedback                         | Edit workspace to return [0,1] unconditionally; click Review code.                                                                                 | Explain a counterexample with expected versus actual behavior. Do not claim executed tests or silently fix it.                                                       |
| Apply feedback                   | “Fix that bug.”                                                                                                                                    | Explain the change and generate one complete implementation for review. Diff against the latest valid code baseline.                                                 |
| Constraint change                | “Now extra memory must be O(1), the input cannot be changed, and I still need original indices.”                                                   | Reassess the hash-map approach. Do not suggest sorting as though it preserves original indices with no extra cost. Explain the time/space trade-off.                 |
| Already optimal                  | On a correct hash-map solution: click Optimize.                                                                                                    | Explain the input-reading bound and relevant average/worst-case caveats; no invented asymptotic speedup.                                                             |
| Explain aloud                    | “Explain why we check before inserting, in two sentences.”                                                                                         | Brief natural first-person explanation of avoiding reuse of the same element. No full lesson or code regeneration.                                                   |
| Different problem                | “New question: validate balanced brackets in a string containing only ()[]{}.”                                                                     | Use new problem constraints, not Two Sum assumptions. Explain stack invariant and O(n) time/O(n) space.                                                              |
| Mixed interruption               | During discussion: “Tell me about a disagreement.” Then “Back to brackets: show a failing example.”                                                | Use supplied personal facts or ask for them; return to the algorithm context without rewriting unrelated code.                                                       |
| Full walkthrough                 | “Give the full approach, implementation and dry run now.”                                                                                          | Honor the direct request without unnecessary checkpoints.                                                                                                            |

For spoken tests, enable automatic responses and speak the same turns. A brief “yes” after a checkpoint should continue, while reading the assistant's answer aloud should normally be ignored. Speaker identification is unavailable, so ambiguous audio remains a live acceptance concern.

## Limits

Automatic guidance and relevant feedback accompany conversational turns. Feedback uses a code snapshot when a request is sent; it does not monitor an external editor or review every keystroke. All traces and reviews are model reasoning, not executed tests. This release has no code execution sandbox. Long conversations have bounded history; pin important constraints and restate an earlier problem if needed. No guarantee of model accuracy, fixed latency or interview outcome is made.

### Discussing the approach and reviewing code versions

The approach response includes a short **Algorithm** block: indented language-neutral pseudocode with
initialization, conditions, updates and return behavior. This supports the spoken
reasoning before implementation; it does not create a workspace proposal. Follow-up
questions get focused answers, and clarifications are reserved for decisions that
could change the solution. Model responses still require review in a live practice
session.

Open **Code workspace → History** to inspect completed code proposals or working
snapshots retained before acceptance. **Compare with working code** shows the
selected version on the original side and current working code on the modified side.
Browsing is read-only; return to **Review changes** to accept the current proposal.
Generated versions are not necessarily accepted versions. History covers the retained
conversation (up to 30 turns) and up to 20 pre-acceptance working snapshots, not every
manual edit. Reopened saved sessions recover generated versions from saved answers;
pre-acceptance working snapshots are session-only.

The spoken baseline and improvement are displayed separately as **Brute force** and
**Better approach**. A complete problem statement does not automatically settle
input mutation or other implementation constraints: ask one consequential question
when needed, wait, and then discuss the approach. Do not manufacture questions about
facts already supplied. Ambiguous transcript fragments should be confirmed rather
than expanded into invented questions.

Pseudocode uses the `pseudocode` fence tag and stays in the answer panel. It is a
planning aid, not executable source or an accepted workspace revision. Actual
implementation still requires authorization. Short spoken explanations and trace
tables should not repeat all the pseudocode steps aloud.

Approach explanations use a short idea followed by concrete steps and a bottleneck.
Time and space appear on separate highlighted lines with their derivations. Complete
problem statements do not need variant confirmation. An unclear reply does not
confirm a constraint, and correcting a constraint updates only the affected reasoning.
Code can be hidden and reopened without losing working code or proposals. Explicit
new-problem transitions hide the panel; a new implementation proposal opens it again.

### Following the conversation

Response guidance selects the current step: clarification, approach discussion,
implementation, validation or a focused follow-up. A clarification waits for the
answer; implementation follows explicit approval. Approach notes use **Explain**,
**Write**, **Walk through**, **Check** and **Reference** labels to distinguish speech
from supporting material. These labels are reading aids, not instructions to say
aloud or a mandatory checklist for every answer.

The agreed objective stays fixed until the interviewer changes it. For example,
exactly two products totaling a voucher value must not silently become buying the
maximum number of products within a budget.

Behavioral answers use supplied personal facts. When a needed fact is missing, a
separate **Personal context needed · not spoken** note requests it. This prevents
assistant-style coaching from appearing as the candidate's spoken answer; it does
not authorize invented experience. Live model adherence still needs evaluation.
