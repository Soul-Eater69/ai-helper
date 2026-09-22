# Visual dry runs

New DSA responses can include a whiteboard-style walkthrough with **Back / Next step**, a diagram, **Say this**, and **Write / mark**. Trees and graphs show highlighted calls/traversals and returned values. Arrays, grids and DP tables show the current cells, marks and values. Named collections show a stack, queue, map or other working state. **All walkthrough notes** opens the entire explanation for scanning without clicking through it. **Copy response** copies readable notes rather than drawing JSON.

These are model-generated **manual traces**, not executed programs. The UI validates structure and references, not algorithmic correctness. Existing saved Markdown tables remain readable; they are not retroactively converted into diagrams. Use **Dry run** in Practice tools or ask for a fresh walkthrough to get the new format.

## Response contract

A fenced `dry-run` block contains the version 1 JSON validated in `src/shared/visual-trace.ts`. The model instructions and worked example are in `src/shared/visual-trace-guidance.ts`.

- `kind`: `tree`, `graph`, `array`, `grid`, `dp`, or `notes`.
- `title`, `input`: plain text.
- `nodes`: unique IDs, labels and integer row/column positions. Duplicate values are allowed; duplicate IDs/positions are not.
- `edges`: existing endpoints; optional `directed`. A highlighted return may follow an edge backward.
- `steps`: title, speech and writing notes, with optional active/done/removed IDs, values, highlighted edge and named collections.
- Every step is a complete snapshot. It does not mutate or inherit the prior step's data. Back navigation must reproduce exactly the prior state.
- Maxima: 48 nodes, 96 edges, 32 steps, row/column 0–11, 48,000 input characters. Responses retain the application's existing total limit; the prompt asks for small examples.

No model HTML, scripts, drawing commands or remote images are rendered. Labels are plain React text. An incomplete streamed block shows a preparation message. A malformed completed block shows a local fallback with original data available for inspection; it does not block other answer text or an otherwise valid code proposal. Source-language code continues through the existing request/version guards and requires acceptance.

Large diagrams can be scrolled horizontally without shrinking labels. Long labels have full text available in the node title; models should use short node labels and put detailed state into writing notes. Session history stores the original answer. Outbound conversation and routing context converts visual blocks to readable notes before applying existing size bounds.

## Manual acceptance with a real model

1. Ask for the minimum-removal parentheses approach. Confirm it explains why a count is insufficient to locate extra openings, why a stack stores indices, and why marking avoids shifting them. Confirm no code proposal before authorization.
2. Ask for a dry run using a short string with an unmatched closing bracket, a matched pair and a leftover opening. Step through the marks and stack. Check that each speaking note explains the corresponding decision.
3. Ask for maximum tree depth with an asymmetric tree. Confirm descent, empty-child returns and combination of left/right depths are shown. Node values must not be mistaken for returned depths.
4. Ask for Course Schedule and a small graph where one course needs two others. It must wait when its count changes from 2 to 1, and become ready only at 0.
5. Ask for a small DP walkthrough. Check that the highlighted source cells contain the values used in the written transition, and that the fill order makes them available.
6. Type a follow-up while viewing a later step; it should stay selected. Generate another question and navigate old and new walkthroughs independently.
7. Ask “What is enumerate?” and then “Rewrite it without enumerate.” Expect prose only for the first and a focused code proposal for the second, with no automatic new trace.

Automated checks cover schema bounds/references, proposal isolation, partial/invalid output, copy/context conversion, tree/graph/array/grid/DP rendering, navigation and conversation state. They do not prove model response quality, algorithm correctness, or live Windows/audio behavior. No credentials are needed for these tests.
