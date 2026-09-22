import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';

it('flushes a partial PCM chunk once without losing the last spoken samples', () => {
  const messages: { buffer?: ArrayBuffer; flushed?: boolean }[] = [];
  const port = {
    postMessage: vi.fn((message) => messages.push(message)),
    onmessage: undefined as undefined | ((event: { data: string }) => void),
  };
  let Processor: any;
  runInNewContext(readFileSync('public/pcm-worklet.js', 'utf8'), {
    AudioWorkletProcessor: class {
      port = port;
    },
    registerProcessor: (_name: string, implementation: unknown) => {
      Processor = implementation;
    },
  });
  const processor = new Processor();
  processor.process([[new Float32Array(128).fill(0.5)]]);
  expect(messages).toHaveLength(0);
  port.onmessage!({ data: 'flush' });
  expect(messages[0].buffer?.byteLength).toBe(256);
  expect(messages[1]).toEqual({ flushed: true });
  port.onmessage!({ data: 'flush' });
  expect(messages.filter((message) => message.buffer)).toHaveLength(1);
});
