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
  ['gpt-5.6-sol', 'low', { effort: 'low' }],
  ['gpt-5.6-sol', 'adaptive', { effort: 'none' }],
  ['gpt-5.4', 'adaptive', { effort: 'none' }],
  ['gpt-4o-mini', 'none', undefined],
  ['gpt-4o-mini', 'adaptive', undefined],
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

it('preserves an existing model and uses adaptive effort when loading older settings', () => {
  const settings = settingsSchema.parse({ model: 'gpt-5.4' });
  expect(settings.model).toBe('gpt-5.4');
  expect(settings.answerReasoning).toBe('adaptive');
  expect(settingsSchema.parse({ answerReasoning: 'auto' }).answerReasoning).toBe('auto');
});

it('uses low effort in adaptive mode for a new technical problem', async () => {
  const request = answerRequestSchema.parse({
    id: 'adaptive-hard',
    question:
      'Implement a function that returns the longest substring without repeating characters.',
    code: '',
    codeVersion: 0,
    language: 'python',
    history: [],
  });
  for await (const _event of openAIProvider(
    request,
    settingsSchema.parse({}),
    'key',
    new AbortController().signal,
  )) {
    /* consume */
  }
  const body = create.mock.lastCall?.[0] as { reasoning?: unknown; max_output_tokens: number };
  expect(body.reasoning).toEqual({ effort: 'low' });
  expect(body.max_output_tokens).toBeGreaterThan(6000);
});

it('retries without an explicit effort when the model rejects it', async () => {
  create.mockImplementationOnce(() => {
    throw Object.assign(new Error('Unsupported value for reasoning.effort'), {
      status: 400,
      param: 'reasoning.effort',
    });
  });
  const request = answerRequestSchema.parse({
    id: 'reject',
    question: 'Hi, how are you?',
    code: '',
    codeVersion: 0,
    language: 'python',
    history: [],
  });
  const events = [];
  for await (const event of openAIProvider(
    request,
    settingsSchema.parse({ model: 'gpt-5.9' }),
    'key',
    new AbortController().signal,
  ))
    events.push(event);
  expect(events).toEqual([{ type: 'complete' }]);
  expect((create.mock.lastCall?.[0] as { reasoning?: unknown }).reasoning).toBeUndefined();
});

it('sends the question as plain labelled text instead of a JSON blob', async () => {
  const request = answerRequestSchema.parse({
    id: 'plain',
    question: 'Why use a heap here?',
    code: 'import heapq',
    codeVersion: 0,
    language: 'python',
    history: [],
  });
  for await (const _event of openAIProvider(
    request,
    settingsSchema.parse({ model: 'gpt-4o-mini', profile: 'Private profile facts' }),
    'key',
    new AbortController().signal,
  )) {
    /* consume */
  }
  const body = create.mock.lastCall?.[0] as {
    instructions: string;
    input: { content: { type: string; text?: string }[] }[];
  };
  const text = body.input.at(-1)!.content[0].text!;
  expect(text.startsWith('Question (latest interviewer turn):\nWhy use a heap here?')).toBe(true);
  expect(text).toContain('currentCode (codeSource=working');
  expect(text).not.toContain('Private profile facts');
  expect(() => JSON.parse(text)).toThrow();
  expect(body.instructions).toContain('dsa:');
  expect(body.instructions).not.toContain('lld:');
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
