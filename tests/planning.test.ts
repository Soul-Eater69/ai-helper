import { expect, it } from 'vitest';
import { planningCode } from '../src/shared/planning';
import { extractProposal } from '../src/shared/revision';
it('keeps complete planning blocks separate from executable proposals', () => {
  const answer = 'Plan\n```pseudocode\npark(size):\n  find a spot\n```\nExplain why.';
  expect(planningCode(answer)).toBe('park(size):\n  find a spot');
  expect(extractProposal(answer, 0)).toBeNull();
  expect(planningCode('```pseudocode\npartial')).toBe('');
  expect(planningCode('```python\nprint(1)\n```')).toBe('');
});
