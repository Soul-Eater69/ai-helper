import { afterEach, expect, it, vi } from 'vitest';
import { SpeechQueue } from '../src/renderer/speech-queue';
afterEach(() => vi.useRealTimers());
it('prepares in parallel with the router, retains one draft across wait, and cancels on continued speech', async () => {
  vi.useFakeTimers();
  let resolve!: (decision: { action: 'wait' }) => void;
  const prepare = vi.fn();
  const cancel = vi.fn();
  const queue = new SpeechQueue(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => {},
    () => {},
    () => {},
    { prepare, cancel },
  );
  queue.final('Consider this algorithm');
  await vi.advanceTimersByTimeAsync(350);
  expect(prepare).toHaveBeenCalledWith('Consider this algorithm', []);
  resolve({ action: 'wait' });
  await vi.advanceTimersByTimeAsync(1600);
  expect(prepare).toHaveBeenCalledTimes(1);
  cancel.mockClear();
  queue.started('continuation');
  expect(cancel).toHaveBeenCalledTimes(1);
  resolve({ action: 'wait' });
  queue.stop();
});

it('discards hidden preparation on ignored speech and routing failure', async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const error = vi.fn();
  const route = vi
    .fn()
    .mockResolvedValueOnce({ action: 'ignore' })
    .mockRejectedValueOnce(new Error('offline'));
  const queue = new SpeechQueue(
    route,
    () => {},
    () => {},
    error,
    { prepare: () => {}, cancel },
  );
  queue.final('Some speech');
  cancel.mockClear();
  await vi.advanceTimersByTimeAsync(350);
  expect(cancel).toHaveBeenCalledOnce();
  queue.final('New speech');
  cancel.mockClear();
  await vi.advanceTimersByTimeAsync(350);
  expect(cancel).toHaveBeenCalledOnce();
  expect(error).toHaveBeenCalledOnce();
});
it('sends a semantic question automatically, including short clarification replies', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn(async () => ({ action: 'answer' as const }));
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Two exits.');
  await vi.advanceTimersByTimeAsync(349);
  expect(route).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(route).toHaveBeenCalledWith('Two exits.', []);
  expect(answer).toHaveBeenCalledWith('Two exits.', []);
});
it('retains incomplete speech and combines it with the next fragment', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi
    .fn()
    .mockResolvedValueOnce({ action: 'wait' })
    .mockResolvedValueOnce({ action: 'answer' });
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Given a list of numbers');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).not.toHaveBeenCalled();
  queue.partial();
  queue.final('find the pair with the target sum');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).toHaveBeenCalledWith(
    'Given a list of numbers find the pair with the target sum',
    [],
  );
});
it('does not answer ignored speech and keeps it as conversational context', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn(async () => ({ action: 'ignore' as const }));
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('I used a dictionary for this.');
  await vi.advanceTimersByTimeAsync(1100);
  queue.final('Okay.');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).not.toHaveBeenCalled();
  expect(route).toHaveBeenLastCalledWith('Okay.', ['I used a dictionary for this.']);
});
it('invalidates a pending decision when more speech starts or listening stops', async () => {
  vi.useFakeTimers();
  let resolve!: (value: { action: 'answer' }) => void;
  const answer = vi.fn();
  const queue = new SpeechQueue(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    answer,
    () => {},
    () => {},
  );
  queue.final('Explain it');
  await vi.advanceTimersByTimeAsync(1100);
  queue.partial();
  resolve({ action: 'answer' });
  await Promise.resolve();
  expect(answer).not.toHaveBeenCalled();
  queue.final('with an example');
  await vi.advanceTimersByTimeAsync(1100);
  queue.stop();
  resolve({ action: 'answer' });
  await Promise.resolve();
  expect(answer).not.toHaveBeenCalled();
});

import { SpeechService } from '../src/main/speech';
import { settingsSchema, speechRequestSchema } from '../src/shared/contracts';
it('cancels model routing and never releases a stale answer decision', async () => {
  let resolve!: (value: { action: 'answer' }) => void;
  let signal!: AbortSignal;
  const service = new SpeechService(async (_request, _settings, _key, inputSignal) => {
    signal = inputSignal;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const pending = service.route(
    speechRequestSchema.parse({
      text: 'Two exits',
      history: [],
      recentSpeech: [],
      currentResponse: '',
    }),
    settingsSchema.parse({}),
    'test',
  );
  service.cancel();
  expect(signal.aborted).toBe(true);
  resolve({ action: 'answer' });
  await expect(pending).resolves.toEqual({ action: 'ignore' });
});
it('rejects malformed model decisions instead of generating an answer', async () => {
  const service = new SpeechService(async () => ({ action: 'unexpected' }) as never);
  await expect(
    service.route(
      speechRequestSchema.parse({
        text: 'Hello',
        history: [],
        recentSpeech: [],
        currentResponse: '',
      }),
      settingsSchema.parse({}),
      'test',
    ),
  ).rejects.toThrow('Could not interpret');
});
it('an older final transcript cannot trigger an answer while a newer utterance is active', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn(async () => ({ action: 'answer' as const }));
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.started('first');
  queue.started('second');
  queue.final('Explain the algorithm', 'first');
  await vi.advanceTimersByTimeAsync(2000);
  expect(route).not.toHaveBeenCalled();
  queue.final('including duplicate values', 'second');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).toHaveBeenCalledWith('Explain the algorithm including duplicate values', []);
});
it('passes ignored spoken context through to the answer model', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi
    .fn()
    .mockResolvedValueOnce({ action: 'ignore' })
    .mockResolvedValueOnce({ action: 'answer' });
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('I used nested loops');
  await vi.advanceTimersByTimeAsync(1100);
  queue.final('What is its complexity?');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).toHaveBeenCalledWith('What is its complexity?', ['I used nested loops']);
});
it('releases a skipped noise utterance so later questions can be answered', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const queue = new SpeechQueue(
    async () => ({ action: 'answer' }),
    answer,
    () => {},
    () => {},
  );
  queue.started('noise');
  queue.final('', 'noise');
  queue.started('question');
  queue.final('Explain the design', 'question');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).toHaveBeenCalledWith('Explain the design', []);
});
it('rechecks a wait after silence and answers without requiring more audio', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi
    .fn()
    .mockResolvedValueOnce({ action: 'wait' })
    .mockResolvedValueOnce({ action: 'answer' });
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Can you describe the solution');
  await vi.advanceTimersByTimeAsync(1100);
  expect(answer).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1500);
  expect(route).toHaveBeenLastCalledWith('Can you describe the solution', [], true);
  expect(answer).toHaveBeenCalledWith('Can you describe the solution', []);
});
it('new speech cancels the scheduled final decision after a wait', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn().mockResolvedValue({ action: 'wait' });
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Given a list');
  await vi.advanceTimersByTimeAsync(1100);
  queue.started('continued');
  await vi.advanceTimersByTimeAsync(3000);
  expect(route).toHaveBeenCalledTimes(1);
  expect(answer).not.toHaveBeenCalled();
});

it('finishes a paused question immediately and does not submit it twice', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn(async () => ({ action: 'answer' as const }));
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Which vehicle types do we support?');
  queue.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(route).toHaveBeenCalledWith('Which vehicle types do we support?', [], true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(answer).toHaveBeenCalledTimes(1);
});

it('holds final fragments during pause until capture is drained', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi.fn(async () => ({ action: 'answer' as const }));
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Which vehicles');
  queue.hold();
  queue.final('should we support?');
  await vi.advanceTimersByTimeAsync(2000);
  expect(route).not.toHaveBeenCalled();
  queue.finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(answer).toHaveBeenCalledWith('Which vehicles should we support?', []);
});

it('counts slow routing toward the silence window instead of adding another full pause', async () => {
  vi.useFakeTimers();
  const answer = vi.fn();
  const route = vi
    .fn()
    .mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({ action: 'wait' }), 3600)),
    )
    .mockResolvedValueOnce({ action: 'answer' });
  const queue = new SpeechQueue(
    route,
    answer,
    () => {},
    () => {},
  );
  queue.final('Explain how the parking allocation works');
  await vi.advanceTimersByTimeAsync(3951);
  expect(route).toHaveBeenCalledTimes(2);
  expect(answer).toHaveBeenCalledTimes(1);
});
