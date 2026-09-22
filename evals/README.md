# LLD conversation evaluation

`npm run eval:lld` lists the evaluation plan without making API calls.

For actual model output, set `OPENAI_API_KEY` and `AI_HELPER_EVAL_MODEL` in the local environment, then run:

```sh
npm run eval:lld -- --live
```

Optional `AI_HELPER_EVAL_REASONING` accepts `auto`, `none`, or `medium`; use the same choice as the app. The provider only applies this option to models supported by its existing implementation. The runner uses the app's actual answer provider, prompt builder, schemas and note conversion. It does not read or modify the desktop credential vault. Use a model available to your API account. Requests use the provider's existing retry policy, so eight planned turns can result in more than eight HTTP attempts.

This is a paid provider evaluation, not a microphone/UI test. Output is saved incrementally in ignored `.eval-results/*.json`, including the prompt version, chosen model, questions, raw answers, automated checks, review criteria and answer-provider timing. First delta is not necessarily the first visible spoken word. Transcription and routing latency are not measured. Token usage/cost is not collected by the existing provider adapter; inspect provider usage separately.

Automated checks detect missing notes, unexpected code proposals, multiple questions and some lost requirements. They are heuristics: a pass does not establish good reasoning or naturalness, and a valid paraphrase can trigger a failure. Review each raw answer against its turn-specific instructions.

For each rubric dimension, score 0 (missed), 1 (partly), or 2 (met):

- Listening: consumes all supplied facts and preserves them across follow-ups.
- Progression: asks the next consequential question or begins the settled design.
- Natural speech: sounds comfortable aloud without forced fillers or formal stock phrases.
- Reasoning: connects actions, state and responsibility instead of only naming classes.
- Grounding: does not invent requirements or treat examples as agreement.

A critical failure is an invented confirmed requirement, an unsolicited workspace proposal, or repeatedly asking a settled question. Do not average away these failures. Require human review for every turn. Repeat live runs to check variability; record results for each model/settings combination separately. No real résumé or personal story is included in these fixtures.
