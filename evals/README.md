# LLD conversation evaluation

`npm run eval:lld` lists the evaluation plan without making API calls.

For actual model output, set `OPENAI_API_KEY` and `AI_HELPER_EVAL_MODEL` in the local environment, then run:

```sh
npm run eval:lld -- --live
```

Optional `AI_HELPER_EVAL_REASONING` accepts `auto`, `none`, or `medium`; use the same choice as the app. The provider only applies this option to models supported by its existing implementation. The runner uses the app's actual answer provider, prompt builder, schemas and note conversion. It does not read or modify the desktop credential vault. Use a model available to your API account. Requests use the provider's existing retry policy, so planned turns can result in additional HTTP attempts.

This is a paid provider evaluation, not a microphone/UI test. Output is saved incrementally in ignored `.eval-results/*.json`, including the prompt version, chosen model, questions, raw answers, automated checks, review criteria and answer-provider timing. First delta is not necessarily the first visible spoken word. Transcription and routing latency are not measured. Token usage/cost is not collected by the existing provider adapter; inspect provider usage separately.

Automated checks detect missing notes, unexpected code proposals, more than two questions and some lost requirements. They are heuristics: a pass does not establish good reasoning or naturalness, and a valid paraphrase can trigger a failure. Review each raw answer against its turn-specific instructions.

For each rubric dimension, score 0 (missed), 1 (partly), or 2 (met):

- Listening: consumes all supplied facts and preserves them across follow-ups.
- Progression: asks the next consequential question or begins the settled design.
- Natural speech: sounds comfortable aloud without forced fillers or formal stock phrases.
- Reasoning: connects actions, state and responsibility instead of only naming classes.
- Grounding: does not invent requirements or treat examples as agreement.

A critical failure is an invented confirmed requirement, an unsolicited workspace proposal, or repeatedly asking a settled question. Do not average away these failures. Require human review for every turn. Repeat live runs to check variability; record results for each model/settings combination separately. No real résumé or personal story is included in these fixtures.

Related questions must address one coherent decision; the numeric check cannot judge this. Review it manually. Implementation turns explicitly require a workspace proposal; planning turns forbid one.

# Baseline vs new comparison

`npm run eval:compare` lists the plan without API calls. To compare real answers from the previous version (default `main`) and your working tree side by side:

```sh
OPENAI_API_KEY=... npm run eval:compare -- --live
```

On Windows PowerShell: `$env:OPENAI_API_KEY="..."; npm run eval:compare -- --live`.

It runs the scripted conversations in `evals/compare-conversations.json` (greetings, DSA with code and a dry run, a noisy transcript, LLD, Amazon behavioral with deep-dive follow-ups and a missing story) through each version's real answer provider, with each version's own history. The profile and stories in the fixture are fictional.

Options: `--base <git ref>` compares against another commit or branch; `--only greeting,behavioral-amazon` runs selected conversations. Environment: `AI_HELPER_EVAL_MODEL` (default `gpt-5.6-sol`), `AI_HELPER_EVAL_BASE_REASONING` (default `none`, matching the old Instant preset) and `AI_HELPER_EVAL_NEW_REASONING` (default `adaptive`).

Output goes to ignored `.eval-results/compare-*.md` (side-by-side answers with time to first token, total time, word counts and heuristic check results, plus a line per turn for your verdict) and a matching `.json`. The key is never printed or saved, and provider errors are recorded only as status and code. Timing covers the answer provider only; the app's early preparation usually hides part of the new version's reasoning time, so live use can feel faster than these numbers. Run it a few times, since answers vary.
