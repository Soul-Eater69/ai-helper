import { expect, it } from 'vitest';
import { splitAnswer } from '../src/shared/revision';
import { compactSpeechRequest } from '../src/shared/history';
import { speechRequestSchema } from '../src/shared/contracts';

it('keeps earlier examples visible and proposes the last source block', () => {
  const answer =
    'Example\n```python\nslow()\n```\nFinal\n```python\nfast()\n```\n```text\nresult 3\n```';
  const split = splitAnswer(answer, 8);
  expect(split.proposal).toEqual({ code: 'fast()', language: 'python', baseVersion: 8 });
  expect(split.spoken).toContain('slow()');
  expect(split.spoken).toContain('result 3');
  expect(split.spoken).not.toContain('fast()');
});
it('never hides or proposes traces, unknown languages or unfinished final source', () => {
  for (const answer of [
    '```text\ni=1\n```',
    '```\noutput 3\n```',
    '```unknown\nx\n```',
    '```python\nearly()\n```\n```python\nunfinished(',
  ]) {
    expect(splitAnswer(answer, 0)).toEqual({ spoken: answer, proposal: null });
  }
});
it('preserves full current speech while compacting old context to validated router limits', () => {
  const text = 'important requirement '.repeat(300);
  const request = compactSpeechRequest({
    text,
    context: 'p'.repeat(12000),
    finalize: true,
    recentSpeech: Array.from({ length: 12 }, (_, i) => `${i} ${'x'.repeat(1590)}`),
    currentResponse: 'a'.repeat(5000) + ' May I code now?',
    history: Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? ('assistant' as const) : ('user' as const),
      content: `${i} ${'h'.repeat(3000)}`,
    })),
  });
  expect(speechRequestSchema.safeParse(request).success).toBe(true);
  expect(request.text).toBe(text);
  expect(request.recentSpeech).toHaveLength(6);
  expect(request.recentSpeech.every((s) => s.length <= 600)).toBe(true);
  expect(request.history).toHaveLength(2);
  expect(request.history[0].content).toContain('18 ');
  expect(request.currentResponse).toMatch(/May I code now\?$/);
  expect(request.finalize).toBe(true);
});
it('does not substitute an earlier example when the final source block is empty', () => {
  const answer = '```python\nexample()\n```\nFinal\n```python\n\n```';
  expect(splitAnswer(answer, 0)).toEqual({ spoken: answer, proposal: null });
});
