import { afterEach, expect, it, vi } from 'vitest';
import { SessionController } from '../src/main/session-controller';
import type { StreamProvider } from '../src/main/assistant';
import { SpeechQueue } from '../src/renderer/speech-queue';
import { settingsSchema, type AnswerRequest, type AppEvent } from '../src/shared/contracts';

const request = (id = 'one'): AnswerRequest => ({
  id,
  question: 'Explain the approach',
  context: '',
  code: '',
  codeVersion: 0,
  language: 'python',
  history: [],
});
const config = { key: 'test-key', settings: settingsSchema.parse({}) };
const flush = async () => {
  for (let i = 0; i < 15; i++) await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

it('overlaps a 1000ms routing call with 1200ms answer generation instead of adding their delays', async () => {
  vi.useFakeTimers();
  const events: AppEvent[] = [];
  const provider: StreamProvider = async function* () {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    yield { type: 'delta', text: 'Approach' };
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    (e) => events.push(e),
    async () => config,
  );
  const queue = new SpeechQueue(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { action: 'answer' };
    },
    () => {
      void controller.answer(request());
    },
    () => {},
    () => {},
    {
      prepare: () => {
        void controller.prepare(request());
      },
      cancel: () => controller.discard(),
      settleMs: 0,
    },
  );
  queue.final('Explain the approach');
  await vi.advanceTimersByTimeAsync(1000);
  expect(events).toEqual([]);
  await vi.advanceTimersByTimeAsync(200);
  expect(events.some((e) => e.type === 'answer.delta')).toBe(true);
  controller.cancel();
  queue.stop();
});

it('prepares invisibly and commits completed text without a second generation', async () => {
  let calls = 0;
  const events: AppEvent[] = [];
  const provider: StreamProvider = async function* () {
    calls++;
    yield { type: 'delta', text: 'Useful explanation' };
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    (e) => events.push(e),
    async () => config,
  );
  await controller.prepare(request());
  await flush();
  expect(events).toEqual([]);
  await controller.answer(request());
  expect(calls).toBe(1);
  expect(events).toEqual([
    { type: 'answer.delta', id: 'one', text: 'Useful explanation' },
    { type: 'answer.done', id: 'one', text: 'Useful explanation' },
  ]);
  controller.cancel();
});

it('cancels before asynchronous credential setup finishes', async () => {
  let load!: (value: typeof config) => void;
  let calls = 0;
  const provider: StreamProvider = async function* () {
    calls++;
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    () => {},
    () =>
      new Promise((resolve) => {
        load = resolve;
      }),
  );
  const pending = controller.prepare(request());
  controller.discard('one');
  load(config);
  await pending;
  expect(calls).toBe(0);
});

it('drops late hidden output after interruption without cancelling the visible answer', async () => {
  let resume!: () => void;
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  let signal!: AbortSignal;
  const events: AppEvent[] = [];
  const provider: StreamProvider = async function* (r, _s, _k, s) {
    if (r.id === 'draft') {
      signal = s;
      await wait;
    }
    yield { type: 'delta', text: r.id };
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    (e) => events.push(e),
    async () => config,
  );
  await controller.answer(request('visible'));
  await flush();
  await controller.prepare(request('draft'));
  controller.discard('draft');
  expect(signal.aborted).toBe(true);
  resume();
  await flush();
  expect(events.filter((e) => 'id' in e && e.id === 'draft')).toEqual([]);
  expect(events.some((e) => e.type === 'answer.done' && e.id === 'visible')).toBe(true);
  controller.cancel();
});

it.each(['code', 'context', 'history', 'settings'] as const)(
  'regenerates when %s changed while preparing',
  async (field) => {
    let calls = 0;
    let currentConfig = config;
    const events: AppEvent[] = [];
    const provider: StreamProvider = async function* () {
      calls++;
      yield { type: 'delta', text: `version ${calls}` };
      yield { type: 'complete' };
    };
    const controller = new SessionController(
      provider,
      (e) => events.push(e),
      async () => currentConfig,
    );
    await controller.prepare(request());
    await flush();
    const updated = request();
    if (field === 'code') {
      updated.code = 'new code';
      updated.codeVersion++;
    }
    if (field === 'context') updated.context = 'No mutations';
    if (field === 'history') updated.history = [{ role: 'user', content: 'New constraint' }];
    if (field === 'settings')
      currentConfig = { ...config, settings: { ...config.settings, language: 'java' } };
    await controller.answer(updated);
    await flush();
    expect(calls).toBe(2);
    expect(events.some((e) => e.type === 'answer.delta' && e.text === 'version 1')).toBe(false);
    controller.cancel();
  },
);

it('expires a draft and retries a hidden failed draft only after authorization', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const provider: StreamProvider = async function* () {
    calls++;
    if (calls === 1) throw new Error('unavailable');
    yield { type: 'delta', text: 'Recovered' };
    yield { type: 'complete' };
  };
  const events: AppEvent[] = [];
  const controller = new SessionController(
    provider,
    (e) => events.push(e),
    async () => config,
  );
  await controller.prepare(request());
  await flush();
  expect(events).toEqual([]);
  await controller.answer(request());
  await flush();
  expect(events.some((e) => e.type === 'answer.done')).toBe(true);
  await controller.prepare(request('expired'));
  await flush();
  await vi.advanceTimersByTimeAsync(30001);
  await controller.answer(request('expired'));
  await flush();
  expect(calls).toBe(4);
  controller.cancel();
});

it('ignores duplicate commits and stale discard messages', async () => {
  let calls = 0;
  const provider: StreamProvider = async function* () {
    calls++;
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    () => {},
    async () => config,
  );
  await controller.prepare(request('new'));
  controller.discard('old');
  await controller.answer(request('new'));
  await flush();
  await controller.answer(request('new'));
  await flush();
  expect(calls).toBe(1);
  controller.cancel();
});

it('commits a running stream exactly once and forwards only its new deltas', async () => {
  let resume!: () => void;
  const wait = new Promise<void>((r) => {
    resume = r;
  });
  const events: AppEvent[] = [];
  const provider: StreamProvider = async function* () {
    yield { type: 'delta', text: 'First ' };
    await wait;
    yield { type: 'delta', text: 'second' };
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    (e) => events.push(e),
    async () => config,
  );
  await controller.prepare(request());
  await flush();
  await controller.answer(request());
  resume();
  await flush();
  expect(
    events
      .filter((e) => e.type === 'answer.delta')
      .map((e) => e.text)
      .join(''),
  ).toBe('First second');
  expect(events.filter((e) => e.type === 'answer.done')).toHaveLength(1);
  controller.cancel();
});

it('does not start a foreground request cancelled during credential setup', async () => {
  let resume!: (value: typeof config) => void;
  let calls = 0;
  const provider: StreamProvider = async function* () {
    calls++;
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    () => {},
    () =>
      new Promise((r) => {
        resume = r;
      }),
  );
  const answer = controller.answer(request());
  controller.cancel();
  resume(config);
  await answer;
  expect(calls).toBe(0);
});

it('bounds speculative request churn but always allows an authorized answer', async () => {
  vi.useFakeTimers();
  let calls = 0;
  const provider: StreamProvider = async function* () {
    calls++;
    yield { type: 'complete' };
  };
  const controller = new SessionController(
    provider,
    () => {},
    async () => config,
  );
  for (let i = 0; i < 12; i++) {
    await controller.prepare(request(`draft-${i}`));
    await flush();
  }
  expect(calls).toBe(6);
  await controller.answer(request('confirmed'));
  await flush();
  expect(calls).toBe(7);
  await vi.advanceTimersByTimeAsync(30001);
  await controller.prepare(request('later'));
  await flush();
  expect(calls).toBe(8);
  controller.cancel();
});
