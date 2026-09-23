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

it('sends current and previous question images as vision inputs, not JSON text', async () => {
  const image = { id: 'i', name: 'Problem', dataUrl: 'data:image/png;base64,aGVsbG8=' };
  const request = answerRequestSchema.parse({
    id: 'vision',
    question: 'Read this',
    code: '',
    codeVersion: 0,
    language: 'python',
    images: [image],
    history: [{ role: 'user', content: 'Earlier image', images: [image] }],
  });
  for await (const _event of openAIProvider(
    request,
    settingsSchema.parse({}),
    'key',
    new AbortController().signal,
  )) {
    /* consume */
  }
  const body = create.mock.lastCall?.[0] as { input: { content: unknown }[] };
  const messages = body.input.filter((m) => (m as { role?: string }).role !== 'developer');
  expect(messages[0].content).toEqual([
    { type: 'input_text', text: 'Earlier image' },
    { type: 'input_image', image_url: image.dataUrl, detail: 'high' },
  ]);
  expect(messages[1].content).toEqual([
    expect.objectContaining({ type: 'input_text' }),
    { type: 'input_image', image_url: image.dataUrl, detail: 'high' },
  ]);
});

it('places a reusable explicit cache boundary after stable guidance for the supported model', async () => {
  const request = answerRequestSchema.parse({
    id: 'cache',
    question: 'Explain this',
    code: '',
    codeVersion: 0,
    language: 'python',
    history: [],
  });
  for await (const _event of openAIProvider(
    request,
    settingsSchema.parse({ model: 'gpt-5.6-sol' }),
    'test',
    new AbortController().signal,
  )) {
    /* consume */
  }
  expect(create.mock.lastCall?.[0]).toMatchObject({
    prompt_cache_options: { mode: 'explicit' },
    input: [
      expect.objectContaining({
        role: 'developer',
        content: [expect.objectContaining({ prompt_cache_breakpoint: { mode: 'explicit' } })],
      }),
      expect.anything(),
    ],
  });
});
