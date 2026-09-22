import { expect, it, vi } from 'vitest';
import { answerRequestSchema, settingsSchema } from '../src/shared/contracts';
const create = vi.hoisted(() =>
  vi.fn(async function* (_body: unknown) {
    yield { type: 'response.completed' };
  }),
);
vi.mock('openai', () => ({
  default: class {
    responses = { create };
  },
}));
const { openAIProvider } = await import('../src/main/assistant');

it.each([
  ['gpt-5.6-sol', 'none', { effort: 'none' }],
  ['gpt-5.6-sol', 'medium', { effort: 'medium' }],
  ['gpt-5.6-sol', 'auto', undefined],
  ['gpt-4o-mini', 'none', undefined],
])('sends supported reasoning for %s / %s', async (model, answerReasoning, reasoning) => {
  const settings = settingsSchema.parse({ model, answerReasoning });
  const request = answerRequestSchema.parse({
    id: 'model-test',
    question: 'Explain a queue',
    code: '',
    codeVersion: 0,
    language: 'python',
    history: [],
  });
  for await (const _event of openAIProvider(
    request,
    settings,
    'test-key',
    new AbortController().signal,
  )) {
    /* consume */
  }
  expect(create.mock.lastCall?.[0]).toMatchObject({ model, stream: true, store: false });
  expect((create.mock.lastCall?.[0] as { reasoning?: unknown }).reasoning).toEqual(reasoning);
});

it('preserves an existing model when loading older settings', () => {
  const settings = settingsSchema.parse({ model: 'gpt-5.4' });
  expect(settings.model).toBe('gpt-5.4');
  expect(settings.answerReasoning).toBe('auto');
});
