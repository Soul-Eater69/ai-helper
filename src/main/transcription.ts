import WebSocket from 'ws';
import type { AppEvent } from '../shared/contracts';
import { TranscriptBuffer } from '../shared/transcript';

// Only deliberately constructed diagnostics cross the renderer boundary.
class TranscriptionError extends Error {}
function providerError(value: unknown): TranscriptionError {
  const error = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const token = (value: unknown) =>
    typeof value === 'string' && /^[a-zA-Z0-9_.]{1,140}$/.test(value) ? value : '';
  const code = token(error.code) || token(error.type) || 'unknown_error';
  const param = token(error.param);
  const hint =
    code === 'invalid_api_key'
      ? 'Your API key was rejected. Update it in Settings.'
      : code === 'insufficient_quota'
        ? 'Check your OpenAI API billing and available credits.'
        : code === 'model_not_found'
          ? 'Choose a transcription model available to your API project.'
          : code === 'rate_limit_exceeded'
            ? 'OpenAI rate limit reached. Wait briefly and retry.'
            : 'Check the transcription model in Settings; try gpt-4o-mini-transcribe.';
  return new TranscriptionError(
    `OpenAI transcription error: ${code}${param ? ` at ${param}` : ''}. ${hint}`,
  );
}
export class TranscriptionService {
  private socket?: WebSocket;
  private epoch = 0;
  private running = false;
  private ready = false;
  private retries = 0;
  private pendingItems = new Set<string>();
  private draining?: {
    promise: Promise<void>;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
    acknowledged: boolean;
  };
  private retryTimer?: ReturnType<typeof setTimeout>;
  private pendingReject?: (error: Error) => void;
  constructor(private emit: (event: AppEvent) => void) {}
  async start(key: string, model: string): Promise<void> {
    this.stop(false);
    this.running = true;
    this.retries = 0;
    const epoch = this.epoch;
    this.emit({ type: 'audio.status', status: 'connecting' });
    try {
      await this.connect(key, model, epoch);
    } catch (error) {
      if (epoch === this.epoch) this.stop();
      if (error instanceof TranscriptionError) throw error;
      throw new TranscriptionError(
        'Could not connect to OpenAI transcription. Check your network or proxy and retry.',
      );
    }
  }
  finish(): Promise<void> {
    if (this.draining) return this.draining.promise;
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) {
      this.stop();
      return Promise.resolve();
    }
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    const timer = setTimeout(() => {
      this.emit({
        type: 'audio.status',
        status: 'ready',
        message:
          'The last audio phrase did not finish in time. Check the transcript and repeat or type any missing words.',
      });
      this.stop();
    }, 6000);
    this.draining = { promise, resolve, timer, acknowledged: false };
    // Commit the captured tail; clear acknowledges the end of ordered client audio.
    this.socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    this.socket.send(JSON.stringify({ type: 'input_audio_buffer.clear' }));
    return promise;
  }
  private finishIfDrained(): void {
    if (this.draining?.acknowledged && !this.pendingItems.size) this.stop();
  }
  stop(notify = true): void {
    const draining = this.draining;
    this.draining = undefined;
    if (draining) {
      clearTimeout(draining.timer);
      draining.resolve();
    }
    this.pendingItems.clear();
    this.running = false;
    this.ready = false;
    this.epoch++;
    clearTimeout(this.retryTimer);
    this.pendingReject?.(new Error('Audio stopped'));
    this.pendingReject = undefined;
    const old = this.socket;
    this.socket = undefined;
    if (old) {
      old.removeAllListeners();
      old.on('error', () => undefined);
      old.terminate();
    }
    if (notify) this.emit({ type: 'audio.status', status: 'stopped' });
  }
  append(data: ArrayBuffer): void {
    if (!this.running || !this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 256000) {
      this.emit({
        type: 'audio.status',
        status: 'error',
        message:
          'Audio upload is falling behind. Listening stopped; check your connection and restart.',
      });
      this.stop();
      return;
    }
    this.socket.send(
      JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: Buffer.from(data).toString('base64'),
      }),
    );
  }
  private connect(key: string, model: string, epoch: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription', {
        headers: { Authorization: `Bearer ${key}` },
        handshakeTimeout: 15000,
        maxPayload: 2 * 1024 * 1024,
      });
      this.socket = socket;
      this.ready = false;
      const buffer = new TranscriptBuffer();
      const partial = new Map<string, string>();
      let acknowledged = false;
      let settled = false;
      const fail = (error: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(error);
        }
      };
      this.pendingReject = fail;
      const timeout = setTimeout(() => {
        fail(
          new TranscriptionError(
            'OpenAI transcription setup timed out. Check your network and retry.',
          ),
        );
        socket.terminate();
      }, 15000);
      socket.on('open', () => {
        if (epoch !== this.epoch) return;
        socket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: 24000 },
                  transcription:
                    model === 'gpt-live-transcribe'
                      ? { model, languages: ['en'], delay: 'low' }
                      : { model, language: 'en' },
                  turn_detection: {
                    type: 'server_vad',
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 850,
                  },
                },
              },
            },
          }),
        );
      });
      socket.on('message', (raw) => {
        if (epoch !== this.epoch) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (event.type === 'session.updated') {
          acknowledged = true;
          settled = true;
          this.ready = true;
          clearTimeout(timeout);
          this.pendingReject = undefined;
          this.emit({ type: 'audio.status', status: 'ready' });
          resolve();
        } else if (
          event.type === 'input_audio_buffer.speech_started' &&
          typeof event.item_id === 'string'
        ) {
          this.emit({ type: 'speech.started', id: event.item_id });
        } else if (event.type === 'input_audio_buffer.cleared' && this.draining) {
          this.draining.acknowledged = true;
          this.finishIfDrained();
        } else if (event.type === 'error') {
          const code = (event.error as { code?: string } | undefined)?.code;
          if (this.draining && code === 'input_audio_buffer_commit_empty') return;
          if (!acknowledged) {
            fail(providerError(event.error));
            socket.terminate();
          } else {
            this.emit({
              type: 'audio.status',
              status: 'error',
              message: providerError(event.error).message,
            });
            this.stop();
          }
        } else if (
          event.type === 'input_audio_buffer.committed' &&
          typeof event.item_id === 'string'
        ) {
          this.pendingItems.add(event.item_id);
          buffer.commit(
            event.item_id,
            typeof event.previous_item_id === 'string' ? event.previous_item_id : null,
          );
        } else if (
          event.type === 'conversation.item.input_audio_transcription.delta' &&
          typeof event.item_id === 'string' &&
          typeof event.delta === 'string'
        ) {
          const text = ((partial.get(event.item_id) ?? '') + event.delta).slice(-20000);
          partial.set(event.item_id, text);
          this.emit({ type: 'transcript.partial', id: event.item_id, text });
        } else if (
          (event.type === 'conversation.item.input_audio_transcription.completed' ||
            event.type === 'conversation.item.input_audio_transcription.failed') &&
          typeof event.item_id === 'string'
        ) {
          partial.delete(event.item_id);
          this.pendingItems.delete(event.item_id);
          const text = typeof event.transcript === 'string' ? event.transcript.slice(0, 20000) : '';
          if (event.type.endsWith('.failed') || !text.trim())
            this.emit({ type: 'speech.skipped', id: event.item_id });
          for (const item of buffer.finish(event.item_id, text))
            this.emit({ type: 'transcript.final', ...item });
          this.finishIfDrained();
          if (event.type.endsWith('.failed') && !this.draining && this.running)
            this.emit({
              type: 'audio.status',
              status: 'ready',
              message: 'A phrase could not be transcribed. Please repeat it or type the question.',
            });
        }
      });
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        const status = response.statusCode;
        const message =
          status === 401
            ? 'Your API key was rejected by OpenAI. Update it in Settings.'
            : status === 403
              ? 'OpenAI denied transcription access. Check your API project permissions and model access.'
              : status === 429
                ? 'OpenAI rejected the connection due to quota or rate limits. Check API billing and retry.'
                : `OpenAI transcription connection failed (HTTP ${status ?? 'unknown'}). Check your network or proxy.`;
        fail(new TranscriptionError(message));
        socket.terminate();
      });
      socket.on('error', () => {
        if (!acknowledged)
          fail(
            new TranscriptionError(
              'Could not connect to OpenAI transcription. Check your network, firewall or proxy.',
            ),
          );
      });
      socket.on('close', () => {
        clearTimeout(timeout);
        if (epoch !== this.epoch || !this.running) return;
        this.ready = false;
        if (!acknowledged) {
          fail(
            new TranscriptionError(
              'OpenAI closed the transcription connection before setup completed. Retry listening.',
            ),
          );
          return;
        }
        if (this.draining) {
          this.emit({
            type: 'audio.status',
            status: 'ready',
            message: 'Audio disconnected before the last phrase finished. Check the transcript.',
          });
          this.stop();
          return;
        }
        this.pendingItems.clear();
        this.reconnect(key, model, epoch);
      });
    });
  }
  private reconnect(key: string, model: string, epoch: number): void {
    if (epoch !== this.epoch || !this.running) return;
    if (++this.retries > 3) {
      this.emit({
        type: 'audio.status',
        status: 'error',
        message:
          'Audio disconnected after three retries. Restart listening when the connection is stable.',
      });
      this.stop();
      return;
    }
    this.emit({
      type: 'audio.status',
      status: 'reconnecting',
      message:
        'Reconnecting. Audio during this gap is not retained; repeat the question after reconnection.',
    });
    this.retryTimer = setTimeout(
      () => {
        if (epoch !== this.epoch || !this.running) return;
        void this.connect(key, model, epoch).catch(() => {
          const old = this.socket;
          this.socket = undefined;
          if (old) {
            old.removeAllListeners();
            old.on('error', () => undefined);
            old.terminate();
          }
          this.reconnect(key, model, epoch);
        });
      },
      Math.min(1000 * 2 ** (this.retries - 1), 8000),
    );
  }
}
