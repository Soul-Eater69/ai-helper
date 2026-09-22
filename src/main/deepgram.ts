import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AppEvent } from '../shared/contracts';

const resultSchema = z.object({
  type: z.literal('Results'),
  start: z.number().nonnegative(),
  duration: z.number().nonnegative(),
  is_final: z.boolean(),
  speech_final: z.boolean().optional(),
  channel: z.object({
    alternatives: z
      .array(
        z.object({
          transcript: z.string().max(20000),
          words: z
            .array(
              z.object({
                word: z.string().max(1000),
                punctuated_word: z.string().max(1000).optional(),
                start: z.number().nonnegative(),
                end: z.number().nonnegative(),
                speaker: z.number().int().min(0).max(1000).optional(),
              }),
            )
            .max(5000),
        }),
      )
      .min(1),
  }),
});

/** One socket provides both text and speaker labels. Audio is never retained. */
export class DeepgramTranscriptionService {
  private socket?: WebSocket;
  private rejectStart?: (error: Error) => void;
  private timeout?: ReturnType<typeof setTimeout>;
  private keepAlive?: ReturnType<typeof setInterval>;
  private ready = false;
  constructor(private emit: (event: AppEvent) => void) {}

  async start(key: string, _model?: string): Promise<void> {
    this.stop(false);
    this.emit({ type: 'audio.status', status: 'connecting' });
    const query = new URLSearchParams({
      model: 'nova-3',
      language: 'en',
      encoding: 'linear16',
      sample_rate: '24000',
      channels: '1',
      diarize_model: 'v1',
      interim_results: 'true',
      punctuate: 'true',
      endpointing: '850',
      utterance_end_ms: '1200',
      vad_events: 'true',
    });
    const socket = new WebSocket(`wss://api.deepgram.com/v1/listen?${query}`, {
      headers: { Authorization: `Token ${key}` },
      handshakeTimeout: 15000,
      maxPayload: 2 * 1024 * 1024,
    });
    this.socket = socket;
    const session = randomUUID();
    const speechId = `${session}:speech`;
    let deliveredUntil = -1;
    let speechActive = false;
    const finishSpeech = () => {
      if (!speechActive) return;
      speechActive = false;
      this.emit({ type: 'speech.skipped', id: speechId, diarized: true });
    };
    return new Promise<void>((resolve, reject) => {
      this.rejectStart = reject;
      const fail = (message: string) => {
        if (this.socket !== socket) return;
        const wasReady = this.ready;
        this.rejectStart?.(new Error(message));
        this.rejectStart = undefined;
        this.stop(false);
        if (wasReady) this.emit({ type: 'audio.status', status: 'error', message });
      };
      this.timeout = setTimeout(
        () => fail('Deepgram connection timed out. Check your network and retry.'),
        15000,
      );
      socket.on('open', () => {
        if (this.socket !== socket) return;
        clearTimeout(this.timeout);
        this.ready = true;
        this.rejectStart = undefined;
        this.keepAlive = setInterval(() => {
          if (this.socket === socket && socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'KeepAlive' }));
        }, 4000);
        this.emit({ type: 'audio.status', status: 'ready' });
        resolve();
      });
      socket.on('unexpected-response', (_request, response) => {
        response.resume();
        fail(
          response.statusCode === 401 || response.statusCode === 403
            ? 'Deepgram rejected the API key or its permissions. Check Settings.'
            : 'Deepgram could not start. Check your credits, connection and account access.',
        );
      });
      socket.on('error', () =>
        fail('Deepgram connection failed. Check your network and restart listening.'),
      );
      socket.on('close', () =>
        fail('Deepgram disconnected. Restart listening and select the speaker again.'),
      );
      socket.on('message', (raw) => {
        if (this.socket !== socket || !this.ready) return;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!event || typeof event !== 'object') return;
        if (event.type === 'Error') {
          fail(
            'Deepgram reported an audio error. Restart listening; check your account if it persists.',
          );
          return;
        }
        if (event.type === 'SpeechStarted') {
          if (!speechActive) this.emit({ type: 'speech.started', id: speechId, diarized: true });
          speechActive = true;
          return;
        }
        if (event.type === 'UtteranceEnd') {
          finishSpeech();
          return;
        }
        const parsed = resultSchema.safeParse(event);
        if (!parsed.success) return;
        const result = parsed.data;
        const alternative = result.channel.alternatives[0];
        if (!result.is_final) {
          // Interim text replaces the preview; it never enters the answer queue.
          if (alternative.transcript.trim() && result.start + result.duration > deliveredUntil)
            this.emit({ type: 'transcript.partial', id: speechId, text: alternative.transcript });
          return;
        }
        const end = result.start + result.duration;
        if (end > deliveredUntil) {
          const words = alternative.words.filter((word) => word.end > deliveredUntil);
          const groups: { text: string; speaker?: number; start: number }[] = [];
          for (const word of words) {
            const text = word.punctuated_word ?? word.word;
            const previous = groups.at(-1);
            if (previous && previous.speaker === word.speaker) previous.text += ` ${text}`;
            else groups.push({ text, speaker: word.speaker, start: word.start });
          }
          if (!alternative.words.length && alternative.transcript.trim())
            groups.push({ text: alternative.transcript, start: result.start });
          if (groups.length) speechActive = true;
          for (const [index, group] of groups.entries())
            this.emit({
              type: 'transcript.final',
              id: `${session}:${result.start}:${index}`,
              text: group.text,
              speaker: group.speaker,
              diarized: true,
            });
          deliveredUntil = end;
        }
        if (result.speech_final) finishSpeech();
      });
    });
  }

  append(data: ArrayBuffer): void {
    if (!this.ready || this.socket?.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > 256000) {
      this.stop(false);
      this.emit({
        type: 'audio.status',
        status: 'error',
        message: 'Deepgram upload fell behind. Restart listening when the connection is stable.',
      });
      return;
    }
    this.socket.send(Buffer.from(data));
  }

  stop(notify = true): void {
    this.ready = false;
    clearTimeout(this.timeout);
    clearInterval(this.keepAlive);
    this.rejectStart?.(new Error('Listening stopped.'));
    this.rejectStart = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => undefined);
      socket.terminate();
    }
    if (notify) this.emit({ type: 'audio.status', status: 'stopped' });
  }
}
