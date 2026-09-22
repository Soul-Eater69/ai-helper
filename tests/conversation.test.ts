import { expect, it } from 'vitest';
import { startsNewProblem } from '../src/shared/conversation';

it('recognizes explicit new-problem transitions without hiding ordinary follow-ups', () => {
  for (const text of [
    "Okay, let's get to another question. Assume there are courses",
    "Let's move on to the next coding problem",
    'Next question: find a valid order',
    'Okay, let’s get to another question. Course Schedule',
  ]) {
    expect(startsNewProblem(text)).toBe(true);
  }
  for (const text of [
    'Explain the next line',
    'What if I pass a new grid?',
    'Can you implement it?',
    'How does that help with another problem?',
  ]) {
    expect(startsNewProblem(text)).toBe(false);
  }
});
