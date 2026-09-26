// Side-by-side answer comparison: a baseline git ref (default main) vs the working tree.
// Runs the same scripted conversations through each version's real answer provider and
// writes a JSON report plus a Markdown report for human review.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const live = args.includes('--live');
const baseRef = option('base', 'main');
const only = option('only', '');
const judge = args.includes('--judge');
const newOnly = args.includes('--new-only');
const project = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(
  await readFile(new URL('../evals/compare-conversations.json', import.meta.url), 'utf8'),
);
const scenarios = fixture.scenarios.filter((s) => !only || only.split(',').includes(s.name));
const turnCount = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
const model = process.env.AI_HELPER_EVAL_MODEL || 'gpt-5.6-sol';
const allVariants = [
  {
    id: 'baseline',
    label: `Baseline (${baseRef})`,
    reasoning: process.env.AI_HELPER_EVAL_BASE_REASONING || 'none',
  },
  {
    id: 'candidate',
    label: 'New (working tree)',
    reasoning: process.env.AI_HELPER_EVAL_NEW_REASONING || 'adaptive',
  },
];
const variants = newOnly ? allVariants.filter((v) => v.id === 'candidate') : allVariants;
const judgeModel = process.env.AI_HELPER_EVAL_JUDGE_MODEL || model;
const judgedTurns = scenarios
  .filter((s) => s.behavioral)
  .reduce((sum, s) => sum + s.turns.length, 0);

if (!live) {
  console.log(
    `Plan only: ${scenarios.length} conversations, ${turnCount} turns, ${turnCount * variants.length + (judge ? judgedTurns * variants.length : 0)} model requests${judge ? ` (including ${judgedTurns * variants.length} bar-raiser grades by ${judgeModel})` : ''} (${variants.map((v) => `${v.id}: reasoning ${v.reasoning}`).join(', ')}), model ${model}. No API calls made.`,
  );
  for (const s of scenarios) console.log(`  ${s.name}: ${s.turns.length} turns`);
  console.log(
    'To run: set OPENAI_API_KEY (and optionally AI_HELPER_EVAL_MODEL), then npm run eval:compare -- --live. Options: --base <git ref>, --only <scenario,...>, --new-only (skip the baseline), --judge (grade behavioral answers like an Amazon bar raiser). API usage is billed to your account.',
  );
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in your environment. Its value is never printed or saved.');
  process.exit(1);
}

const git = (...parts) =>
  execFileSync('git', parts, {
    cwd: project,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const resolveRef = (ref) => {
  for (const candidate of [ref, `origin/${ref}`]) {
    try {
      return git('rev-parse', '--verify', `${candidate}^{commit}`);
    } catch {
      /* try the next form */
    }
  }
  throw new Error(`Cannot find git ref "${ref}". Fetch it first (git fetch origin ${ref}).`);
};

const RATINGS = ['Strong No Hire', 'No Hire', 'Lean No Hire', 'Lean Hire', 'Hire', 'Strong Hire'];
const JUDGE_INSTRUCTIONS = `You are an experienced Amazon bar raiser grading one spoken answer from a mid-level (SDE II) software engineering candidate in a behavioral interview. Be demanding and specific; do not reward length or polish for its own sake.

Rate the answer as one of: ${RATINGS.join(', ')}. Use "Not rated" only when the answer is a note asking the user for missing personal facts ([Context needed]) instead of an answer; that is the correct behavior when no supplied story fits, so explain whether asking was justified.

Judge against Amazon's bar:
1. Answers the exact question and gives clear signal for the leadership principle(s) it probes.
2. STAR: brief situation and task, detailed actions, a concrete result, a learning. For a follow-up probe, judge only whether it answers the probe directly with new depth instead of retelling.
3. Ownership: "I" for the candidate's own decisions and actions; a clear line between their work and the team's.
4. Data: specific metrics and evidence behind decisions and results.
5. Judgment: stakes, trade-offs, alternatives considered and why the chosen action was right.
6. Scope appropriate for a mid-level engineer.
7. Delivery: sounds natural spoken aloud; about 2 minutes for a first answer, much shorter for a probe.

Grounding is critical. The candidate's real experience is exactly the supplied facts. List every concrete claim (an action, person, reaction, metric, event or detail) that the facts do not support. Reasonable paraphrase and generic framing are fine; new specifics are fabrications. Fabricated specifics cap the rating at Lean No Hire, because they collapse under a bar raiser's follow-up probing.

Return only the JSON object required by the schema.`;
const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'rating',
    'principles_probed',
    'star',
    'strengths',
    'gaps',
    'fabricated_claims',
    'to_reach_strong_hire',
  ],
  properties: {
    rating: { type: 'string', enum: [...RATINGS, 'Not rated'] },
    principles_probed: { type: 'array', items: { type: 'string' } },
    star: {
      type: 'object',
      additionalProperties: false,
      required: ['situation', 'task', 'action', 'result', 'learning'],
      properties: Object.fromEntries(
        ['situation', 'task', 'action', 'result', 'learning'].map((k) => [k, { type: 'boolean' }]),
      ),
    },
    strengths: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    fabricated_claims: { type: 'array', items: { type: 'string' } },
    to_reach_strong_hire: { type: 'string' },
  },
};
const storyFacts = [
  `Profile: ${fixture.profile}`,
  ...fixture.stories.map((story) =>
    [
      `Story: ${story.title}`,
      ...['situation', 'task', 'action', 'result', 'learning']
        .filter((k) => story[k])
        .map((k) => `${k}: ${story[k]}`),
    ].join('\n'),
  ),
].join('\n\n');
let judgeClient;
async function gradeAnswer(question, history, answer) {
  if (!judgeClient) {
    const OpenAI = createRequire(join(project, 'package.json'))('openai');
    judgeClient = new (OpenAI.default ?? OpenAI)({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 1,
      timeout: 120000,
    });
  }
  const conversation = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Interviewer' : 'Candidate'}: ${m.content.slice(0, 3000)}`)
    .join('\n\n');
  const reasoningModel = /^gpt-5\.\d+/.test(judgeModel) && !/chat/i.test(judgeModel);
  try {
    const response = await judgeClient.responses.create({
      model: judgeModel,
      store: false,
      instructions: JUDGE_INSTRUCTIONS,
      ...(reasoningModel ? { reasoning: { effort: 'medium' } } : {}),
      max_output_tokens: 6000,
      input: `Supplied facts (the candidate's only real experience):\n${storyFacts}\n\nEarlier conversation:\n${conversation || '(none)'}\n\nQuestion being graded:\n${question}\n\nCandidate's answer:\n${answer}`,
      text: {
        format: {
          type: 'json_schema',
          name: 'bar_raiser_grade',
          strict: true,
          schema: JUDGE_SCHEMA,
        },
      },
    });
    return JSON.parse(response.output_text);
  } catch (caught) {
    return { error: { status: caught?.status ?? null, code: caught?.code ?? null } };
  }
}

const directory = join(project, '.eval-results');
await mkdir(directory, { recursive: true });
const temporary = await mkdtemp(join(directory, 'compare-'));
const baseTree = join(temporary, 'baseline-src');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const jsonFile = join(directory, `compare-${stamp}.json`);
const mdFile = join(directory, `compare-${stamp}.md`);

async function loadApi(root, name) {
  const outfile = join(temporary, `${name}.cjs`);
  await build({
    stdin: {
      contents: `export { openAIProvider } from './src/main/assistant'; export { settingsSchema, answerRequestSchema } from './src/shared/contracts'; export { PROMPT_VERSION } from './src/shared/prompts'; export { extractProposal } from './src/shared/revision'; export { answerAsNotes } from './src/shared/visual-trace';`,
      resolveDir: root,
      loader: 'ts',
    },
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    logLevel: 'silent',
  });
  // Packages resolve from this project's node_modules because the bundle lives inside it.
  return createRequire(join(project, 'package.json'))(outfile);
}

/** Parse settings with each version's own schema, dropping fields an older version lacks. */
function settingsFor(api, reasoning) {
  const input = {
    model,
    answerReasoning: reasoning,
    candidateName: fixture.candidateName,
    language: 'python',
    profile: fixture.profile,
    stories: fixture.stories,
    seniority: 'mid',
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = api.settingsSchema.safeParse(input);
    if (result.success) return result.data;
    let changed = false;
    for (const issue of result.error.issues) {
      if (issue.code === 'unrecognized_keys')
        for (const key of issue.keys) changed = delete input[key] || changed;
      if (issue.path?.[0] === 'answerReasoning') {
        input.answerReasoning = 'none'; // older versions lack adaptive/low
        changed = true;
      }
    }
    if (!changed) throw new Error(`Settings rejected: ${result.error.issues[0]?.message}`);
  }
  throw new Error('Settings could not be parsed for this version.');
}

const words = (text) => (text.match(/\b[\w'’-]+\b/g) || []).length;
const percentile = (values, p) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * p;
  const low = Math.floor(rank);
  return Math.round(sorted[low] + (sorted[Math.ceil(rank)] - sorted[low]) * (rank - low));
};
const median = (values) => percentile(values, 0.5);
const ms = (value) => (value === null || value === undefined ? '-' : `${value} ms`);

// Observe what each version actually sends (effort, prompt size) and when response
// headers arrive, without touching the key: only these fields are read from the body.
const realFetch = globalThis.fetch;
let wire = null;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/responses') && typeof init?.body === 'string') {
    try {
      const body = JSON.parse(init.body);
      wire = {
        effort: body.reasoning?.effort ?? 'model default',
        promptChars: (body.instructions?.length ?? 0) + JSON.stringify(body.input ?? '').length,
        sentAt: performance.now(),
      };
    } catch {
      wire = null;
    }
  }
  const response = await realFetch(url, init);
  if (wire) wire.headersAt = performance.now();
  return response;
};

const report = {
  model,
  baseRef,
  baseCommit: '',
  candidateCommit: '',
  startedAt: new Date().toISOString(),
  variants: [],
  results: [],
  note: 'Timing per answer: headersMs = response headers received, firstDeltaMs = first answer text, totalMs = answer complete. Answer provider only: excludes transcription, routing and the app early-preparation head start. Human review is required; automated checks are heuristics.',
};

try {
  const baseCommit = resolveRef(baseRef);
  report.baseCommit = baseCommit;
  report.candidateCommit = `${git('rev-parse', 'HEAD')}${git('status', '--porcelain') ? ' + uncommitted changes' : ''}`;
  const apis = { candidate: await loadApi(project, 'candidate') };
  if (!newOnly) {
    git('worktree', 'add', '--detach', baseTree, baseCommit);
    apis.baseline = await loadApi(baseTree, 'baseline');
  }
  for (const variant of variants) {
    const api = apis[variant.id];
    variant.settings = settingsFor(api, variant.reasoning);
    report.variants.push({
      id: variant.id,
      label: variant.label,
      promptVersion: api.PROMPT_VERSION,
      answerReasoning: variant.settings.answerReasoning,
    });
  }

  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    // Alternate which version runs first so warm connections do not favour one side.
    const order = scenarioIndex % 2 ? [...variants].reverse() : variants;
    for (const variant of order) {
      const api = apis[variant.id];
      const history = [];
      let code = '';
      for (const [index, turn] of scenario.turns.entries()) {
        const started = performance.now();
        wire = null;
        let firstDeltaMs = null;
        let output = '';
        let completed = false;
        let error = null;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180000);
        try {
          const request = api.answerRequestSchema.parse({
            id: crypto.randomUUID(),
            question: turn.question,
            code,
            codeVersion: 0,
            codeSource: 'working',
            language: 'python',
            context: '',
            history,
          });
          for await (const event of api.openAIProvider(
            request,
            variant.settings,
            process.env.OPENAI_API_KEY,
            controller.signal,
          )) {
            if (event.type === 'delta') {
              firstDeltaMs ??= Math.round(performance.now() - started);
              output += event.text;
            } else completed = true;
          }
        } catch (caught) {
          // Keep only non-sensitive identifiers; never serialize raw provider errors.
          error = {
            status: caught?.status ?? null,
            code: caught?.code ?? null,
            aborted: controller.signal.aborted,
          };
        } finally {
          clearTimeout(timeout);
        }
        const proposal = api.extractProposal(output, 0);
        const spoken = output.replace(/```[\s\S]*?```/g, '');
        const checks = {
          completed: completed && !error,
          codeAsExpected: turn.expectCode ? !!proposal : !proposal,
          ...(turn.expectFacts
            ? {
                usesExpectedFacts: turn.expectFacts.every((pattern) =>
                  new RegExp(pattern, 'i').test(output),
                ),
              }
            : {}),
          ...(turn.expectContextNeeded !== undefined
            ? { contextNeededNote: /\[Context needed\]/i.test(output) === turn.expectContextNeeded }
            : {}),
        };
        const row = {
          scenario: scenario.name,
          turn: index + 1,
          variant: variant.id,
          question: turn.question,
          review: turn.review,
          output,
          effort: wire?.effort ?? null,
          promptChars: wire?.promptChars ?? null,
          headersMs: wire?.headersAt ? Math.round(wire.headersAt - started) : null,
          firstDeltaMs,
          totalMs: Math.round(performance.now() - started),
          spokenWords: words(spoken),
          questionsAsked: (spoken.match(/\?/g) || []).length,
          checks,
          error,
        };
        if (judge && scenario.behavioral && output.trim() && !error)
          row.grade = await gradeAnswer(turn.question, history, output);
        report.results.push(row);
        await writeFile(jsonFile, JSON.stringify(report, null, 2));
        const passed = Object.values(checks).every(Boolean);
        console.log(
          `${scenario.name} #${index + 1} ${variant.id} [effort ${row.effort ?? '-'}]: ${passed ? 'checks ok' : 'CHECK FAILED'}, first token ${firstDeltaMs ?? '-'} ms, total ${row.totalMs} ms${row.grade?.rating ? `, bar raiser: ${row.grade.rating}` : ''}${error ? `, error ${error.status ?? ''} ${error.code ?? ''}` : ''}`,
        );
        if (error) break;
        if (proposal) code = proposal.code;
        history.push(
          { role: 'user', content: turn.question },
          { role: 'assistant', content: api.answerAsNotes(output).slice(0, 20000) },
        );
      }
    }
  }

  // Markdown report for side-by-side reading.
  const byVariant = (id) => report.results.filter((r) => r.variant === id);
  const lines = [
    `# Answer comparison — ${model}`,
    '',
    `Baseline: \`${baseRef}\` @ ${report.baseCommit.slice(0, 8)} · New: working tree @ ${report.candidateCommit.slice(0, 8)}${report.candidateCommit.includes('+') ? ' (uncommitted)' : ''}`,
    '',
    '## Latency summary',
    '',
    '| Version | Prompt | Reasoning | First token median / p90 | Total median / p90 | Median prompt size | Checks passed |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...report.variants.map((v) => {
      const rows = byVariant(v.id);
      const ok = rows.filter((r) => Object.values(r.checks).every(Boolean)).length;
      const first = rows.map((r) => r.firstDeltaMs);
      const total = rows.map((r) => r.totalMs);
      return `| ${v.label} | ${v.promptVersion} | ${v.answerReasoning} | ${ms(median(first))} / ${ms(percentile(first, 0.9))} | ${ms(median(total))} / ${ms(percentile(total, 0.9))} | ${median(rows.map((r) => r.promptChars)) ?? '-'} chars | ${ok}/${rows.length} |`;
    }),
    '',
    '### By reasoning effort actually sent',
    '',
    '| Version | Effort | Answers | First token median | Total median |',
    '| --- | --- | --- | --- | --- |',
    ...report.variants.flatMap((v) => {
      const rows = byVariant(v.id);
      const efforts = [...new Set(rows.map((r) => r.effort ?? 'unknown'))];
      return efforts.map((effort) => {
        const group = rows.filter((r) => (r.effort ?? 'unknown') === effort);
        return `| ${v.label} | ${effort} | ${group.length} | ${ms(median(group.map((r) => r.firstDeltaMs)))} | ${ms(median(group.map((r) => r.totalMs)))} |`;
      });
    }),
    '',
    '### By conversation (median first token / total)',
    '',
    `| Conversation | ${report.variants.map((v) => v.label).join(' | ')} |`,
    `| --- | ${report.variants.map(() => '---').join(' | ')} |`,
    ...scenarios.map((scenario) => {
      const cells = report.variants.map((v) => {
        const rows = byVariant(v.id).filter((r) => r.scenario === scenario.name);
        return `${ms(median(rows.map((r) => r.firstDeltaMs)))} / ${ms(median(rows.map((r) => r.totalMs)))}`;
      });
      return `| ${scenario.name} | ${cells.join(' | ')} |`;
    }),
    '',
    ...(judge
      ? [
          '## Bar-raiser grades (behavioral answers)',
          '',
          `Graded by ${judgeModel} against an Amazon SDE II bar. An automated grader is a signal, not a verdict; read the gaps.`,
          '',
          `| Version | ${[...RATINGS].reverse().join(' | ')} | Not rated | Graded | Fabrications |`,
          `| --- | ${RATINGS.map(() => '---').join(' | ')} | --- | --- | --- |`,
          ...report.variants.map((v) => {
            const graded = byVariant(v.id).filter((r) => r.grade?.rating);
            const count = (rating) => graded.filter((r) => r.grade.rating === rating).length;
            const fabricated = graded.filter((r) => r.grade.fabricated_claims?.length).length;
            return `| ${v.label} | ${[...RATINGS].reverse().map(count).join(' | ')} | ${count('Not rated')} | ${graded.length} | ${fabricated} answers |`;
          }),
          '',
        ]
      : []),
    `_${report.note}_`,
    '',
  ];
  for (const scenario of scenarios) {
    lines.push(`## ${scenario.name}`, '');
    for (const [index, turn] of scenario.turns.entries()) {
      lines.push(`### Turn ${index + 1}: ${turn.question}`, '', `> Look for: ${turn.review}`, '');
      for (const variant of variants) {
        const row = report.results.find(
          (r) => r.scenario === scenario.name && r.turn === index + 1 && r.variant === variant.id,
        );
        if (!row) continue;
        const failed = Object.entries(row.checks)
          .filter(([, ok]) => !ok)
          .map(([name]) => name);
        lines.push(
          `#### ${variant.label} — effort ${row.effort ?? '-'} · first token ${ms(row.firstDeltaMs)} · total ${ms(row.totalMs)} · ${row.spokenWords} spoken words${failed.length ? ` · **failed: ${failed.join(', ')}**` : ''}`,
          '',
          row.output.trim() || '_(no output)_',
          '',
          ...(row.grade?.rating
            ? [
                `**Bar raiser: ${row.grade.rating}**${row.grade.principles_probed?.length ? ` · probes ${row.grade.principles_probed.join(', ')}` : ''}`,
                '',
                ...(row.grade.strengths?.length
                  ? [`- Strengths: ${row.grade.strengths.join('; ')}`]
                  : []),
                ...(row.grade.gaps?.length ? [`- Gaps: ${row.grade.gaps.join('; ')}`] : []),
                ...(row.grade.fabricated_claims?.length
                  ? [`- **Fabricated:** ${row.grade.fabricated_claims.join('; ')}`]
                  : []),
                `- To reach Strong Hire: ${row.grade.to_reach_strong_hire}`,
                '',
              ]
            : row.grade?.error
              ? [
                  `_Bar-raiser grade failed (${row.grade.error.status ?? ''} ${row.grade.error.code ?? ''})._`,
                  '',
                ]
              : []),
        );
      }
      lines.push(
        variants.length > 1 ? 'Better: baseline / new / tie — notes:' : 'Notes:',
        '',
        '---',
        '',
      );
    }
  }
  await writeFile(mdFile, lines.join('\n'));
  console.log(`\nSide-by-side report: ${mdFile}\nRaw data: ${jsonFile}`);
} finally {
  try {
    git('worktree', 'remove', '--force', baseTree);
  } catch {
    /* the worktree may not have been created */
  }
  await rm(temporary, { recursive: true, force: true });
}
