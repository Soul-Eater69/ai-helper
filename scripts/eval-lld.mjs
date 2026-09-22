import { build } from 'esbuild';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const cases = JSON.parse(
  await readFile(new URL('../evals/lld-conversation.json', import.meta.url), 'utf8'),
);
const live = process.argv.includes('--live');
const count = cases.reduce((sum, item) => sum + item.turns.length, 0);
if (!live) {
  console.log(
    `Plan only: ${cases.length} conversations, ${count} sequential model requests. No API calls made.`,
  );
  for (const item of cases) console.log(`${item.name}: ${item.turns.length} turns`);
  console.log(
    'To run: set OPENAI_API_KEY and AI_HELPER_EVAL_MODEL, then npm run eval:lld -- --live. API usage is billed to your account.',
  );
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY || !process.env.AI_HELPER_EVAL_MODEL) {
  console.error(
    'Set OPENAI_API_KEY and AI_HELPER_EVAL_MODEL explicitly. Values will not be printed.',
  );
  process.exit(1);
}
// Work from the project directory on Windows as well as Unix.
const { fileURLToPath } = await import('node:url');
const project = fileURLToPath(new URL('..', import.meta.url));
const directory = join(project, '.eval-results');
await mkdir(directory, { recursive: true });
const temporary = await mkdtemp(join(directory, 'runner-'));
const file = join(directory, `lld-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const report = {
  mode: 'live-provider',
  promptVersion: '',
  model: process.env.AI_HELPER_EVAL_MODEL,
  startedAt: new Date().toISOString(),
  rubric: [
    'Listening: carries all supplied facts forward and does not repeat settled questions.',
    'Progression: asks a meaningful missing question or moves into concrete design.',
    'Natural speech: easy to say aloud, short connected paragraphs, no forced fillers.',
    'Reasoning: explains why state/objects are needed, not just their names.',
    'Grounding: no invented requirements, exclusions, personal experience or results.',
  ],
  results: [],
  humanReview: 'REQUIRED. Automated checks do not establish naturalness or semantic correctness.',
};
try {
  const bundle = join(temporary, 'provider.cjs');
  await build({
    stdin: {
      contents: `export { openAIProvider } from './src/main/assistant'; export { settingsSchema, answerRequestSchema } from './src/shared/contracts'; export { PROMPT_VERSION } from './src/shared/prompts'; export { requirementsFromAnswer } from './src/shared/requirements'; export { extractProposal } from './src/shared/revision'; export { answerAsNotes } from './src/shared/visual-trace';`,
      resolveDir: project,
      loader: 'ts',
    },
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    logLevel: 'silent',
  });
  const api = createRequire(import.meta.url)(bundle);
  report.promptVersion = api.PROMPT_VERSION;
  const settings = api.settingsSchema.parse({
    model: process.env.AI_HELPER_EVAL_MODEL,
    answerReasoning: process.env.AI_HELPER_EVAL_REASONING || 'auto',
    candidateName: 'Ramesh',
    language: 'python',
    profile: '',
    stories: [],
  });
  for (const scenario of cases) {
    const history = [...(scenario.history || [])];
    for (const [index, turn] of scenario.turns.entries()) {
      const started = performance.now();
      let firstDeltaMs = null;
      let output = '';
      let completed = false;
      let failed = false;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
        const request = api.answerRequestSchema.parse({
          id: crypto.randomUUID(),
          question: turn.question,
          code: '',
          codeVersion: 0,
          language: 'python',
          context: '',
          history,
        });
        for await (const event of api.openAIProvider(
          request,
          settings,
          process.env.OPENAI_API_KEY,
          controller.signal,
        )) {
          if (event.type === 'delta') {
            firstDeltaMs ??= Math.round(performance.now() - started);
            output += event.text;
          } else completed = true;
        }
      } catch {
        failed = true; // Never serialize raw provider errors that could contain request data.
      } finally {
        clearTimeout(timeout);
      }
      const notes = api.requirementsFromAnswer(output);
      const spoken = output.replace(/```[\s\S]*?```/g, '');
      const checks = {
        completed: completed && !failed,
        noWorkspaceProposal: !api.extractProposal(output, 0),
        validRequirements: !!notes,
        atMostOneQuestion: (spoken.match(/\?/g) || []).length <= 1,
        expectedNotes: (turn.notes || []).every((pattern) =>
          new RegExp(pattern, 'i').test((notes?.requirements || []).join(' ')),
        ),
        expectedExclusions: (turn.exclusions || []).every((pattern) =>
          new RegExp(pattern, 'i').test((notes?.outOfScope || []).join(' ')),
        ),
        beginsDesign:
          !turn.design || /class|object|ticket|deposit|compartment|vehicle/i.test(spoken),
        noPermissionToSketch:
          !/can I (?:go ahead and )?(?:sketch|list)|shall I (?:sketch|list)/i.test(spoken),
      };
      report.results.push({
        scenario: scenario.name,
        turn: index + 1,
        question: turn.question,
        output,
        firstDeltaMs,
        totalMs: Math.round(performance.now() - started),
        checks,
        review: turn.review,
        humanScores: null,
      });
      await writeFile(file, JSON.stringify(report, null, 2));
      console.log(
        `${scenario.name} turn ${index + 1}: ${Object.values(checks).every(Boolean) ? 'automated checks passed; human review needed' : 'review failures'}; first delta ${firstDeltaMs ?? 'missing'} ms`,
      );
      if (!completed || failed) {
        process.exitCode = 1;
        break;
      }
      if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
      history.push(
        { role: 'user', content: turn.question },
        { role: 'assistant', content: api.answerAsNotes(output).slice(0, 20000) },
      );
    }
  }
  console.log(`Raw answers and review rubric: ${file}`);
  console.log(
    'Timing covers the answer provider only, not microphone transcription, routing or UI rendering. Token usage/cost is not collected; check provider usage.',
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
