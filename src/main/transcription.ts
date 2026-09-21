import WebSocket from 'ws';
import type { AppEvent } from '../shared/contracts';
import { TranscriptBuffer } from '../shared/transcript';

export class TranscriptionService {
  private socket?: WebSocket;
  private epoch = 0;
  private running = false;
  private ready = false;
  private retries = 0;
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
    } catch {
      if (epoch === this.epoch) this.stop();
      throw new Error(
        'Could not start transcription. Check your API key, transcription model and connection.',
      );
    }
  }
  stop(notify = true): void {
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
        fail(new Error('Transcription setup timeout'));
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
        } else if (event.type === 'error') {
          if (!acknowledged) {
            fail(new Error('Transcription configuration rejected'));
            socket.terminate();
          } else {
            this.emit({
              type: 'audio.status',
              status: 'error',
              message:
                'Transcription was interrupted by a provider error. Check the transcription model and restart listening.',
            });
            this.stop();
          }
        } else if (
          event.type === 'input_audio_buffer.committed' &&
          typeof event.item_id === 'string'
        ) {
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
          const text = typeof event.transcript === 'string' ? event.transcript.slice(0, 20000) : '';
          for (const item of buffer.finish(event.item_id, text))
            this.emit({ type: 'transcript.final', ...item });
          if (event.type.endsWith('.failed'))
            this.emit({
              type: 'audio.status',
              status: 'ready',
              message: 'A phrase could not be transcribed. Please repeat it or type the question.',
            });
        }
      });
      socket.on('error', () => {
        if (!acknowledged) fail(new Error('Audio connection failed'));
      });
      socket.on('close', () => {
        clearTimeout(timeout);
        if (epoch !== this.epoch || !this.running) return;
        this.ready = false;
        if (!acknowledged) {
          fail(new Error('Audio connection closed'));
          return;
        }
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
