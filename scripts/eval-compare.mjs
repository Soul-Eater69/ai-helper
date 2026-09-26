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
const project = fileURLToPath(new URL('..', import.meta.url));
const fixture = JSON.parse(
  await readFile(new URL('../evals/compare-conversations.json', import.meta.url), 'utf8'),
);
const scenarios = fixture.scenarios.filter((s) => !only || only.split(',').includes(s.name));
const turnCount = scenarios.reduce((sum, s) => sum + s.turns.length, 0);
const model = process.env.AI_HELPER_EVAL_MODEL || 'gpt-5.6-sol';
const variants = [
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

if (!live) {
  console.log(
    `Plan only: ${scenarios.length} conversations, ${turnCount} turns, ${turnCount * 2} model requests (${variants.map((v) => `${v.id}: reasoning ${v.reasoning}`).join(', ')}), model ${model}. No API calls made.`,
  );
  for (const s of scenarios) console.log(`  ${s.name}: ${s.turns.length} turns`);
  console.log(
    'To run: set OPENAI_API_KEY (and optionally AI_HELPER_EVAL_MODEL), then npm run eval:compare -- --live. Options: --base <git ref>, --only <scenario,...>. API usage is billed to your account.',
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
const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const report = {
  model,
  baseRef,
  baseCommit: '',
  candidateCommit: '',
  startedAt: new Date().toISOString(),
  variants: [],
  results: [],
  note: 'Answer-provider timing only: excludes transcription, routing and the app early-preparation head start. Human review is required; automated checks are heuristics.',
};

try {
  const baseCommit = resolveRef(baseRef);
  report.baseCommit = baseCommit;
  report.candidateCommit = `${git('rev-parse', 'HEAD')}${git('status', '--porcelain') ? ' + uncommitted changes' : ''}`;
  git('worktree', 'add', '--detach', baseTree, baseCommit);
  const apis = {
    baseline: await loadApi(baseTree, 'baseline'),
    candidate: await loadApi(project, 'candidate'),
  };
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
        report.results.push({
          scenario: scenario.name,
          turn: index + 1,
          variant: variant.id,
          question: turn.question,
          review: turn.review,
          output,
          firstDeltaMs,
          totalMs: Math.round(performance.now() - started),
          spokenWords: words(spoken),
          questionsAsked: (spoken.match(/\?/g) || []).length,
          checks,
          error,
        });
        await writeFile(jsonFile, JSON.stringify(report, null, 2));
        const passed = Object.values(checks).every(Boolean);
        console.log(
          `${scenario.name} #${index + 1} ${variant.id}: ${passed ? 'checks ok' : 'CHECK FAILED'}, first token ${firstDeltaMs ?? '-'} ms, total ${Math.round(performance.now() - started)} ms${error ? `, error ${error.status ?? ''} ${error.code ?? ''}` : ''}`,
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
    '| Version | Prompt | Reasoning | Median first token | Median total | Checks passed |',
    '| --- | --- | --- | --- | --- | --- |',
    ...report.variants.map((v) => {
      const rows = byVariant(v.id);
      const ok = rows.filter((r) => Object.values(r.checks).every(Boolean)).length;
      return `| ${v.label} | ${v.promptVersion} | ${v.answerReasoning} | ${median(rows.map((r) => r.firstDeltaMs)) ?? '-'} ms | ${median(rows.map((r) => r.totalMs)) ?? '-'} ms | ${ok}/${rows.length} |`;
    }),
    '',
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
          `#### ${variant.label} — first token ${row.firstDeltaMs ?? '-'} ms · total ${row.totalMs} ms · ${row.spokenWords} spoken words${failed.length ? ` · **failed: ${failed.join(', ')}**` : ''}`,
          '',
          row.output.trim() || '_(no output)_',
          '',
        );
      }
      lines.push('Better: baseline / new / tie — notes:', '', '---', '');
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
