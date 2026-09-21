import { describe, expect, it, vi } from 'vitest';
import { SpeechQueue, WAIT_FLOOR_MS } from '../src/renderer/speech-queue';
import type { SpeechDecision } from '../src/shared/contracts';

function harness(decisions: SpeechDecision['action'][]) {
  const asked: { text: string; speakerStopped: boolean }[] = [];
  const answered: string[] = [];
  const statuses: string[] = [];
  let i = 0;
  const queue = new SpeechQueue(
    async (text, _recent, speakerStopped) => {
      asked.push({ text, speakerStopped });
      return { action: decisions[Math.min(i++, decisions.length - 1)] };
    },
    (text) => answered.push(text),
    (status) => statuses.push(status),
    () => undefined,
  );
  return { queue, asked, answered, statuses };
}

const settle = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};

describe('a wait must always resolve', () => {
  it('re-asks once after silence, telling the router the speaker stopped', async () => {
    vi.useFakeTimers();
    try {
      const { queue, asked, answered } = harness(['wait', 'answer']);
      queue.final('Solve two sum');
      await vi.advanceTimersByTimeAsync(1100);
      await settle();
      expect(asked).toHaveLength(1);
      expect(asked[0].speakerStopped).toBe(false);
      // This is the stall: logged, "Waiting for more", and nothing ever followed.
      expect(answered).toEqual([]);

      await vi.advanceTimersByTimeAsync(WAIT_FLOOR_MS);
      await settle();
      expect(asked).toHaveLength(2);
      expect(asked[1].speakerStopped).toBe(true);
      expect(answered).toEqual(['Solve two sum']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers anyway if the router still says wait once told the speaker stopped', async () => {
    vi.useFakeTimers();
    try {
      const { queue, answered } = harness(['wait', 'wait']);
      queue.final('Solve two sum');
      await vi.advanceTimersByTimeAsync(1100);
      await settle();
      await vi.advanceTimersByTimeAsync(WAIT_FLOOR_MS);
      await settle();
      // Nothing more is coming, so stalling a second time is never the right answer.
      expect(answered).toEqual(['Solve two sum']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('new speech during the wait cancels the forced decision', async () => {
    vi.useFakeTimers();
    try {
      const { queue, asked, answered } = harness(['wait', 'answer']);
      queue.final('Solve two sum');
      await vi.advanceTimersByTimeAsync(1100);
      await settle();
      queue.final('with duplicates allowed');
      await vi.advanceTimersByTimeAsync(1100);
      await settle();
      // The second ask carries the whole utterance, not just the tail.
      expect(asked[1].text).toBe('Solve two sum with duplicates allowed');
      expect(asked[1].speakerStopped).toBe(false);
      expect(answered).toEqual(['Solve two sum with duplicates allowed']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('still ignores speech the router rejects once the speaker stopped', async () => {
    vi.useFakeTimers();
    try {
      const { queue, answered } = harness(['wait', 'ignore']);
      queue.final('sorry, someone at the door');
      await vi.advanceTimersByTimeAsync(1100);
      await settle();
      await vi.advanceTimersByTimeAsync(WAIT_FLOOR_MS);
      await settle();
      expect(answered).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
