import { expect, it } from 'vitest';
import { codingBeats } from '../src/shared/coding-beats';
it('links method narration to its unique declaration, not an earlier call', () => {
  const code =
    'pickup(code)\nclass Locker:\n    def pickup(self, code):\n        pass\n    def deposit(self, size):\n        pass';
  const steps = codingBeats(
    '- **pickup:** I check the code first.\n- **deposit:** I find a free space.',
    code,
  );
  expect(steps.map((step) => step.line)).toEqual([3, 5]);
  expect(steps[0].speech).toBe('I check the code first.');
});
it('does not guess a code location for vague or ambiguous narration', () => {
  expect(codingBeats('- **Queue setup:** I create a queue.', 'queue = []')[0].line).toBeUndefined();
  expect(
    codingBeats('- **run:** I run it.', 'def run():\n pass\ndef run():\n pass')[0].line,
  ).toBeUndefined();
  expect(codingBeats('> I explain the approach.\n> Then I check the input.', '')).toHaveLength(1);
});
