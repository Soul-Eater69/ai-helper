import { SpeechQueue } from '../src/renderer/speech-queue';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AppEvent } from '../src/shared/contracts';
const sockets = vi.hoisted(() => [] as any[]);
vi.mock('ws', () => ({
  default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    terminate = vi.fn();
    constructor(
      public url: string,
      public options: unknown,
    ) {
      super();
      sockets.push(this);
    }
  },
}));
import { DeepgramTranscriptionService } from '../src/main/deepgram';
let service: DeepgramTranscriptionService;
let events: AppEvent[];
beforeEach(() => {
  sockets.length = 0;
  events = [];
  service = new DeepgramTranscriptionService((e) => events.push(e));
});
afterEach(() => service.stop(false));
async function start() {
  const pending = service.start('secret');
  sockets[0].emit('open');
  await pending;
  return sockets[0];
}
const word = (text: string, start: number, speaker?: number) => ({
  word: text,
  start,
  end: start + 0.4,
  speaker,
});
function result(socket: any, words: ReturnType<typeof word>[], extra = {}) {
  socket.emit(
    'message',
    JSON.stringify({
      type: 'Results',
      start: 0,
      duration: 2,
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: words.map((w) => w.word).join(' '), words }] },
      ...extra,
    }),
  );
}
it('uses one authenticated PCM socket and enables streaming diarization', async () => {
  const socket = await start();
  const url = new URL(socket.url);
  expect(url.searchParams.get('diarize_model')).toBe('v1');
  expect(url.searchParams.get('sample_rate')).toBe('24000');
  expect(socket.options.headers).toEqual({ Authorization: 'Token secret' });
  expect(socket.url).not.toContain('secret');
  service.append(new ArrayBuffer(8));
  expect(Buffer.isBuffer(socket.send.mock.calls[0][0])).toBe(true);
});
it('splits a final result at speaker changes and ignores replayed final windows', async () => {
  const socket = await start();
  const words = [word('Explain', 0, 0), word('BFS.', 0.5, 0), word('Okay.', 1, 1)];
  result(socket, words);
  result(socket, words);
  const finals = events.filter((e) => e.type === 'transcript.final');
  expect(finals).toHaveLength(2);
  expect(finals[0]).toMatchObject({ text: 'Explain BFS.', speaker: 0, diarized: true });
  expect(finals[1]).toMatchObject({ text: 'Okay.', speaker: 1 });
});
it('previews interim revisions without queuing them and preserves intentional repetition', async () => {
  const socket = await start();
  result(socket, [word('No', 0, 0)], { is_final: false, speech_final: false });
  expect(events.filter((e) => e.type === 'transcript.final')).toHaveLength(0);
  result(socket, [word('No,', 0, 0), word('no,', 0.5, 0), word('DFS.', 1, 0)]);
  expect(events.find((e) => e.type === 'transcript.final')).toMatchObject({ text: 'No, no, DFS.' });
});
it('does not invent a speaker when labels are absent', async () => {
  const socket = await start();
  result(socket, [word('Hello', 0)]);
  expect(events.find((e) => e.type === 'transcript.final')).toMatchObject({
    diarized: true,
    speaker: undefined,
  });
});
it('ends a speech marker on an empty endpoint or utterance end', async () => {
  const socket = await start();
  socket.emit('message', JSON.stringify({ type: 'SpeechStarted' }));
  result(socket, []);
  const started = events.find((e) => e.type === 'speech.started');
  expect(events).toContainEqual({
    type: 'speech.skipped',
    id: (started as any).id,
    diarized: true,
  });
});
it('rejects cancellation during setup and ignores late events after stop', async () => {
  const pending = service.start('secret');
  const assertion = expect(pending).rejects.toThrow('Listening stopped');
  const socket = sockets[0];
  service.stop();
  socket.emit('open');
  await assertion;
  expect(events.some((e) => e.type === 'audio.status' && e.status === 'ready')).toBe(false);
});
it('sanitizes auth failures and terminates the socket', async () => {
  const pending = service.start('secret');
  const assertion = expect(pending).rejects.toThrow('Deepgram rejected the API key');
  sockets[0].emit('unexpected-response', {}, { statusCode: 401, resume: vi.fn() });
  await assertion;
  expect(sockets[0].terminate).toHaveBeenCalled();
});
it('stops on backpressure instead of retaining unbounded audio', async () => {
  const socket = await start();
  socket.bufferedAmount = 300000;
  service.append(new ArrayBuffer(8));
  expect(socket.terminate).toHaveBeenCalled();
  expect(events.at(-1)).toMatchObject({ type: 'audio.status', status: 'error' });
});
it('fails closed on disconnect and allows a new independent session', async () => {
  const socket = await start();
  socket.emit('close');
  expect(events.at(-1)).toMatchObject({ type: 'audio.status', status: 'error' });
  const pending = service.start('secret');
  sockets[1].emit('open');
  await pending;
  result(sockets[1], [word('New', 0, 0)]);
  expect(events.at(-2)).toMatchObject({ type: 'transcript.final', text: 'New' });
});

it('answers after a completed turn even while empty silence results keep arriving', async () => {
  vi.useFakeTimers();
  try {
    const answer = vi.fn();
    const queue = new SpeechQueue(
      async () => ({ action: 'answer' }),
      answer,
      () => {},
      () => {},
    );
    service = new DeepgramTranscriptionService((event) => {
      if (event.type === 'speech.started') queue.started(event.id);
      if (event.type === 'speech.skipped') queue.final('', event.id);
      if (event.type === 'transcript.partial') queue.partial();
      if (event.type === 'transcript.final') queue.final(event.text, event.id);
    });
    const socket = await start();
    socket.emit('message', JSON.stringify({ type: 'SpeechStarted' }));
    result(socket, [word('Explain BFS?', 0, 0)]);
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(500);
      result(socket, [], { start: 2 + i, duration: 0.5, is_final: false, speech_final: false });
    }
    expect(answer).toHaveBeenCalledOnce();
    queue.stop();
  } finally {
    vi.useRealTimers();
  }
});

it('duplicate end events do not cancel an in-flight routing decision', async () => {
  vi.useFakeTimers();
  try {
    const answer = vi.fn();
    let resolve!: (result: { action: 'answer' }) => void;
    const queue = new SpeechQueue(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
      answer,
      () => {},
      () => {},
    );
    service = new DeepgramTranscriptionService((event) => {
      if (event.type === 'speech.started') queue.started(event.id);
      if (event.type === 'speech.skipped') queue.final('', event.id);
      if (event.type === 'transcript.final') queue.final(event.text, event.id);
    });
    const socket = await start();
    socket.emit('message', JSON.stringify({ type: 'SpeechStarted' }));
    result(socket, [word('Explain BFS?', 0, 0)]);
    await vi.advanceTimersByTimeAsync(1100);
    socket.emit('message', JSON.stringify({ type: 'UtteranceEnd', last_word_end: 0.4 }));
    resolve({ action: 'answer' });
    await vi.advanceTimersByTimeAsync(0);
    expect(answer).toHaveBeenCalledOnce();
    queue.stop();
  } finally {
    vi.useRealTimers();
  }
});
