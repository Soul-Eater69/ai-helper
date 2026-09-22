// AudioContext resamples the selected device to 24 kHz before this processor.
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(2400);
    this.offset = 0;
    this.energy = 0;
    this.port.onmessage = (event) => {
      if (event.data !== 'flush') return;
      if (this.offset) {
        const buffer = this.samples.slice(0, this.offset).buffer;
        this.port.postMessage({ buffer, level: Math.sqrt(this.energy / this.offset) }, [buffer]);
        this.samples = new Int16Array(2400);
        this.offset = 0;
        this.energy = 0;
      }
      this.port.postMessage({ flushed: true });
    };
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] || 0;
      value = Math.max(-1, Math.min(1, value / channels.length));
      this.samples[this.offset++] = Math.round(value * (value < 0 ? 32768 : 32767));
      this.energy += value * value;
      if (this.offset === this.samples.length) {
        const buffer = this.samples.buffer;
        this.port.postMessage({ buffer, level: Math.sqrt(this.energy / this.offset) }, [buffer]);
        this.samples = new Int16Array(2400);
        this.offset = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PCMProcessor);
