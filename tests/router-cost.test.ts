import { describe, expect, it } from 'vitest';
import { buildHistory, buildRouterHistory } from '../src/shared/history';
import { routerModel } from '../src/main/speech';
import { settingsSchema, speechRequestSchema } from '../src/shared/contracts';

const turns = Array.from({ length: 12 }, (_, i) => ({
  question: `Question ${i} about the design`.padEnd(400, '.'),
  answer: 'x'.repeat(4000),
  status: 'done',
}));

const size = (messages: { content: string }[]) =>
  messages.reduce((n, m) => n + m.content.length, 0);

describe('the routing payload stays small', () => {
  it('is a small fraction of the answer payload mid-interview', () => {
    const answer = size(buildHistory(turns));
    const router = size(buildRouterHistory(turns));
    expect(answer).toBeGreaterThan(20000);
    expect(router).toBeLessThan(2500);
    // The guard that matters: routing must never carry the whole interview again.
    expect(router).toBeLessThan(answer / 8);
  });

  it('keeps the tail of the last answer, where a clarifying question sits', () => {
    const asked = [
      { question: 'How many gates?', answer: 'A: ...so, how many exits?', status: 'done' },
    ];
    const [, assistant] = buildRouterHistory(asked);
    expect(assistant.content).toContain('how many exits?');
  });

  it('handles an empty conversation', () => {
    expect(buildRouterHistory([])).toEqual([]);
  });

  it('the schema rejects an oversized payload, so it cannot silently regrow', () => {
    const base = {
      context: '',
      text: 'two exits',
      recentSpeech: [],
      currentResponse: '',
      history: [],
    };
    expect(speechRequestSchema.safeParse(base).success).toBe(true);
    expect(speechRequestSchema.safeParse({ ...base, history: buildHistory(turns) }).success).toBe(
      false,
    );
    expect(
      speechRequestSchema.safeParse({ ...base, currentResponse: 'x'.repeat(6000) }).success,
    ).toBe(false);
  });
});

describe('which model routes', () => {
  it('defaults to a small model, not the answer model', () => {
    const settings = settingsSchema.parse({ model: 'gpt-5.4' });
    expect(routerModel(settings)).not.toBe(settings.model);
    expect(routerModel(settings)).toBe('gpt-4o-mini');
  });

  it('a blank setting falls back to the answer model', () => {
    const settings = settingsSchema.parse({ model: 'gpt-5.4', routerModel: '' });
    expect(routerModel(settings)).toBe('gpt-5.4');
  });
});
