import type { DesktopAPI } from '../../shared/contracts';
export class AudioCapture {
  private context?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private generation = 0;
  constructor(
    private api: DesktopAPI,
    private level: (value: number) => void,
    private ended: () => void,
  ) {}
  async start(source: 'system' | 'microphone'): Promise<void> {
    await this.stop();
    const generation = ++this.generation;
    try {
      await this.api.startAudio(source);
      if (generation !== this.generation) return;
      const stream =
        source === 'system'
          ? await navigator.mediaDevices.getDisplayMedia({
              audio: true,
              video: { width: 320, height: 180, frameRate: 1 },
            })
          : await navigator.mediaDevices.getUserMedia({
              audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
              video: false,
            });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      if (!stream.getAudioTracks().length)
        throw new Error('No audio track was shared. Select an audio-capable source and try again.');
      stream.getTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            void this.stop();
            this.ended();
          },
          { once: true },
        ),
      );
      this.context = new AudioContext({ sampleRate: 24000 });
      if (this.context.sampleRate !== 24000)
        throw new Error(
          'This audio device cannot supply the required 24 kHz audio. Try another device.',
        );
      await this.context.audioWorklet.addModule(
        new URL('pcm-worklet.js', window.location.href).href,
      );
      if (generation !== this.generation) return;
      const node = new AudioWorkletNode(this.context, 'pcm-capture');
      this.node = node;
      node.port.onmessage = (event) => {
        if (generation !== this.generation) return;
        this.api.sendAudio(event.data.buffer);
        this.level(Math.min(1, event.data.level * 5));
      };
      const mute = this.context.createGain();
      mute.gain.value = 0;
      this.context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(node);
      node.connect(mute).connect(this.context.destination);
      await this.context.resume();
    } catch (error) {
      if (generation === this.generation) await this.stop();
      throw error;
    }
  }
  async release(): Promise<void> {
    this.generation++;
    this.node?.disconnect();
    this.node = undefined;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    const context = this.context;
    this.context = undefined;
    if (context && context.state !== 'closed') await context.close();
    this.level(0);
  }
  async stop(): Promise<void> {
    await this.release();
    await this.api.stopAudio();
  }
}
