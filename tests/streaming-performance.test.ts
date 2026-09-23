import { afterEach, expect, it, vi } from 'vitest';
import { DeltaBuffer } from '../src/renderer/delta-buffer';
import { deduplicateCodeHistory } from '../src/shared/history';
afterEach(() => vi.useRealTimers());

it('batches deltas without dropping text and clears pending data on completion or cancellation', async () => {
  vi.useFakeTimers();
  const updates: { id: string; text: string }[] = [];
  const buffer = new DeltaBuffer((id, text) => updates.push({ id, text }));
  buffer.push('one', 'a');
  buffer.push('one', 'b');
  expect(updates).toEqual([]);
  await vi.advanceTimersByTimeAsync(32);
  expect(updates).toEqual([{ id: 'one', text: 'ab' }]);
  buffer.push('one', 'c');
  buffer.clear();
  await vi.advanceTimersByTimeAsync(32);
  expect(updates).toHaveLength(1);
  buffer.push('old', 'discard');
  buffer.push('new', 'keep');
  await vi.advanceTimersByTimeAsync(32);
  expect(updates.at(-1)).toEqual({ id: 'new', text: 'keep' });
});

it('removes only exact repeated code artifacts while retaining explanations and original requirements', () => {
  const code = 'def solve():\n    return 1';
  const history = [
    { role: 'user' as const, content: 'Preserve input.\n```python\n' + code + '\n```' },
    {
      role: 'assistant' as const,
      content: 'First approach\n```python\n' + code + '\n```\nWhy it works',
    },
    {
      role: 'assistant' as const,
      content: 'Changed version\n```python\ndef solve():\n    return 2\n```',
    },
  ];
  const compact = deduplicateCodeHistory(history, code);
  expect(compact[0]).toEqual(history[0]);
  expect(compact[1].content).toContain('First approach');
  expect(compact[1].content).toContain('Why it works');
  expect(compact[1].content).not.toContain('return 1');
  expect(compact[2]).toEqual(history[2]);
  expect(history[1].content).toContain('return 1');
});
