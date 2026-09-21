import { expect, it } from 'vitest';
import { answerRequestSchema, savedSessionSchema, settingsSchema } from '../src/shared/contracts';
import { buildInstructions } from '../src/shared/prompts';
import { buildHistory } from '../src/shared/history';

it('accepts questions without selecting a topic or stage', () => {
  expect(
    answerRequestSchema.safeParse({
      id: 'a',
      question: 'Explain the design and how you handled disagreement',
      code: '',
      codeVersion: 0,
      language: 'python',
      context: 'One level; payment out of scope',
      history: [],
    }).success,
  ).toBe(true);
});
it('provides all strategies and mixed-question guidance on every turn', () => {
  const prompt = buildInstructions(
    settingsSchema.parse({
      prompts: { lld: 'LLD preference', dsa: 'DSA preference', behavioral: 'Story preference' },
    }),
  );
  expect(prompt).toMatch(/mixed/i);
  expect(prompt).toContain('LLD preference');
  expect(prompt).toContain('DSA preference');
  expect(prompt).toContain('Story preference');
  expect(prompt).toMatch(/never invent/i);
  expect(prompt).not.toContain('Current stage:');
});
it('retains original requirements and recent cross-topic follow-ups within budget', () => {
  const turns = Array.from({ length: 20 }, (_, i) => ({
    question: i === 0 ? 'Single level parking; no payments' : `question ${i}`,
    answer: 'x'.repeat(12000),
    status: 'done',
  }));
  const history = buildHistory(turns);
  expect(history[0].content).toContain('Single level parking; no payments');
  expect(history.some((m) => m.content === 'question 19')).toBe(true);
  expect(history.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(80000);
});
it('keeps questions from interrupted turns, without treating partial answers as completed', () => {
  expect(
    buildHistory([{ question: 'Use two exits', answer: 'unfinished', status: 'cancelled' }]),
  ).toEqual([{ role: 'user', content: 'Use two exits' }]);
});
it('loads legacy sessions without requiring a new mode selection', () => {
  const saved = savedSessionSchema.parse({
    id: 'old',
    title: 'parking',
    mode: 'lld',
    updatedAt: new Date().toISOString(),
    code: 'old code',
    language: 'python',
    turns: [],
  });
  expect(saved.code).toBe('old code');
  expect(saved.context).toBe('');
});
