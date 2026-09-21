import { beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsSchema, type SpeechRequest } from '../src/shared/contracts';

/** Records every model the provider asks for, and replays scripted outcomes. */
const calls = vi.hoisted(() => [] as { model: string; maxOutputTokens: number }[]);
const script = vi.hoisted(() => ({ failFirstWith: null as unknown }));

vi.mock('openai', () => ({
  default: class {
    responses = {
      create: async (body: { model: string; max_output_tokens: number }) => {
        calls.push({ model: body.model, maxOutputTokens: body.max_output_tokens });
        if (calls.length === 1 && script.failFirstWith) throw script.failFirstWith;
        return { status: 'completed', output_text: JSON.stringify({ action: 'answer' }) };
      },
    };
  },
}));

const { openAISpeechProvider } = await import('../src/main/speech');

const request: SpeechRequest = {
  context: '',
  text: 'two exits',
  recentSpeech: [],
  currentResponse: '',
  history: [],
};
const settings = settingsSchema.parse({ model: 'big-answer-model', routerModel: 'small-router' });
const run = () => openAISpeechProvider(request, settings, 'key', new AbortController().signal);

beforeEach(() => {
  calls.length = 0;
  script.failFirstWith = null;
});

describe('the routing call', () => {
  it('uses the small router model, not the answer model', async () => {
    await run();
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe('small-router');
  });

  it('falls back to the answer model when the router model is rejected', async () => {
    script.failFirstWith = Object.assign(new Error("model_not_found: 'small-router'"), {
      status: 404,
    });
    await expect(run()).resolves.toEqual({ action: 'answer' });
    expect(calls.map((c) => c.model)).toEqual(['small-router', 'big-answer-model']);
  });

  it('does not retry a failure that is not about the model', async () => {
    // A rate limit or a network error must surface, not silently burn a second call
    // on the expensive model.
    script.failFirstWith = Object.assign(new Error('Rate limit reached'), { status: 429 });
    await expect(run()).rejects.toThrow(/rate limit/i);
    expect(calls).toHaveLength(1);
  });

  it('does not retry when the router model is already the answer model', async () => {
    script.failFirstWith = Object.assign(new Error('model_not_found'), { status: 404 });
    const same = settingsSchema.parse({ model: 'only-model', routerModel: 'only-model' });
    await expect(
      openAISpeechProvider(request, same, 'key', new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
