import { expect, it } from 'vitest';
import { detectTopics, needsReasoning } from '../src/shared/topics';
import { ALL_MODES, buildInstructions } from '../src/shared/prompts';
import { settingsSchema } from '../src/shared/contracts';

const topics = (
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
) => detectTopics({ question, history });

it('detects the topic of a new question', () => {
  expect(
    topics('Given an array of integers, return indices of two numbers that add up to target'),
  ).toEqual(['dsa']);
  expect(topics('Design a parking lot system')).toContain('lld');
  expect(topics('Tell me about a time you disagreed with your manager')).toEqual(['behavioral']);
  expect(topics('Hi, how are you doing?')).toEqual([]);
});

it('inherits the ongoing topic for short follow-ups and clarification answers', () => {
  const history = [
    { role: 'user' as const, content: 'Design a parking lot' },
    { role: 'assistant' as const, content: 'How many entrances and exits should it have?' },
  ];
  expect(topics('Two exits', history)).toContain('lld');
  expect(detectTopics({ question: 'yes', history: [], code: 'def solve(): pass' })).toEqual([
    'dsa',
  ]);
});

it('reasons only for substantial technical turns', () => {
  expect(needsReasoning('Can you implement it now?', ['dsa'])).toBe(true);
  expect(needsReasoning('Yes', ['dsa'])).toBe(false);
  expect(needsReasoning('Walk me through a dry run', ['dsa'])).toBe(true);
  expect(needsReasoning('Tell me about a time you failed', ['behavioral'])).toBe(false);
  expect(needsReasoning('How are you?', [])).toBe(false);
});

it('builds a much smaller prompt when only one topic applies', () => {
  const settings = settingsSchema.parse({});
  const full = buildInstructions(settings, ALL_MODES);
  const dsa = buildInstructions(settings, ['dsa']);
  const chat = buildInstructions(settings, []);
  expect(dsa.length).toBeLessThan(full.length * 0.7);
  expect(chat.length).toBeLessThan(full.length * 0.4);
  expect(dsa).toContain('Visual dry-run output:');
  expect(chat).not.toContain('Visual dry-run output:');
  expect(buildInstructions(settings)).toBe(full);
});
