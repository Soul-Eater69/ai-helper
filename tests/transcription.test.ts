import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
import { settingsSchema } from '../src/shared/contracts';
const sockets = vi.hoisted(() => [] as EventEmitter[]);
vi.mock('ws', () => ({
  default: class extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    bufferedAmount = 0;
    send = vi.fn();
    terminate = vi.fn();
    constructor() {
      super();
      sockets.push(this);
    }
  },
}));
import { TranscriptionService } from '../src/main/transcription';
beforeEach(() => {
  sockets.length = 0;
});
it('defaults to the turn-based transcription model', () => {
  expect(settingsSchema.parse({}).transcriptionModel).toBe('gpt-4o-mini-transcribe');
});
it('identifies rejected configuration without exposing provider message data', async () => {
  const service = new TranscriptionService(() => {});
  const result = service.start('private-key', 'gpt-live-transcribe');
  const assertion = expect(result).rejects.toThrow(
    /invalid_value.*session.audio.input.turn_detection/,
  );
  sockets[0].emit(
    'message',
    JSON.stringify({
      type: 'error',
      error: {
        code: 'invalid_value',
        param: 'session.audio.input.turn_detection',
        message: 'private-key confidential provider text',
      },
    }),
  );
  await assertion;
});
it('reports authentication failure separately from network failure', async () => {
  const service = new TranscriptionService(() => {});
  const result = service.start('key', 'gpt-4o-mini-transcribe');
  const assertion = expect(result).rejects.toThrow(/API key was rejected/);
  sockets[0].emit('unexpected-response', {}, { statusCode: 401, resume: vi.fn() });
  await assertion;
});
it('reports a network failure without exposing raw socket errors', async () => {
  const service = new TranscriptionService(() => {});
  const result = service.start('key', 'gpt-4o-mini-transcribe');
  const assertion = expect(result).rejects.toThrow(/Could not connect to OpenAI/);
  sockets[0].emit('error', new Error('secret raw error'));
  await assertion;
});
it('starts only after configuration acknowledgement and stops cleanly', async () => {
  const events: unknown[] = [];
  const service = new TranscriptionService((event) => events.push(event));
  const result = service.start('key', 'gpt-4o-mini-transcribe');
  sockets[0].emit('open');
  expect(events).not.toContainEqual({ type: 'audio.status', status: 'ready' });
  sockets[0].emit('message', JSON.stringify({ type: 'session.updated' }));
  await result;
  expect(events).toContainEqual({ type: 'audio.status', status: 'ready' });
  service.stop();
});
it('releases successful empty transcription items after a speech start', async () => {
  const events: unknown[] = [];
  const service = new TranscriptionService((event) => events.push(event));
  const starting = service.start('key', 'gpt-4o-mini-transcribe');
  sockets[0].emit('message', JSON.stringify({ type: 'session.updated' }));
  await starting;
  sockets[0].emit(
    'message',
    JSON.stringify({ type: 'input_audio_buffer.speech_started', item_id: 'noise' }),
  );
  sockets[0].emit(
    'message',
    JSON.stringify({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'noise',
      transcript: ' ',
    }),
  );
  expect(events).toContainEqual({ type: 'speech.started', id: 'noise' });
  expect(events).toContainEqual({ type: 'speech.skipped', id: 'noise' });
  service.stop();
});
