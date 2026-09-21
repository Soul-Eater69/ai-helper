import { expect, it, vi } from 'vitest';
import { RequestGate } from '../src/shared/request-gate';
import { SessionSaver } from '../src/renderer/session-saver';
import { AudioCapture } from '../src/renderer/audio/capture';
import type { DesktopAPI, SavedSession } from '../src/shared/contracts';

it('cancelling admission prevents an answer from starting after delayed setup', async () => {
  const gate = new RequestGate();
  const ticket = gate.begin();
  gate.cancel();
  await Promise.resolve();
  expect(gate.isCurrent(ticket)).toBe(false);
  const newer = gate.begin();
  expect(gate.isCurrent(ticket)).toBe(false);
  expect(gate.isCurrent(newer)).toBe(true);
});

it('flushing history persists the outgoing snapshot before session replacement', async () => {
  const saved: SavedSession[] = [];
  const saver = new SessionSaver(
    async (s) => {
      saved.push(s);
    },
    () => undefined,
  );
  const snapshot: SavedSession = {
    id: 'old',
    title: 'Old session',
    updatedAt: new Date().toISOString(),
    context: '',
    code: 'my latest edit',
    language: 'python',
    turns: [],
  };
  saver.schedule(snapshot);
  await saver.flush();
  expect(saved).toEqual([snapshot]);
  expect(saver.hasPending).toBe(false);
});

it('a failed history write stays pending for retry', async () => {
  let fail = true;
  const saver = new SessionSaver(
    async () => {
      if (fail) throw new Error('disk full');
    },
    () => undefined,
  );
  saver.schedule({
    id: 'old',
    title: 'test',
    updatedAt: new Date().toISOString(),
    context: '',
    code: '',
    language: 'python',
    turns: [],
  });
  await expect(saver.flush()).rejects.toThrow('disk full');
  expect(saver.hasPending).toBe(true);
  fail = false;
  await saver.flush();
  expect(saver.hasPending).toBe(false);
});

it('a terminal audio stop releases pending media without sending another stop event', async () => {
  let resolveMedia!: (stream: MediaStream) => void;
  const pending = new Promise<MediaStream>((resolve) => {
    resolveMedia = resolve;
  });
  const stopTrack = vi.fn();
  let stopCalls = 0;
  const api = {
    startAudio: async () => undefined,
    stopAudio: async () => {
      stopCalls++;
    },
  } as unknown as DesktopAPI;
  let requested!: () => void;
  const acquired = new Promise<void>((resolve) => {
    requested = resolve;
  });
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: () => {
        requested();
        return pending;
      },
    },
  });
  try {
    const capture = new AudioCapture(
      api,
      () => undefined,
      () => undefined,
    );
    const starting = capture.start('microphone');
    await acquired;
    await capture.release();
    resolveMedia({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream);
    await starting;
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(stopCalls).toBe(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
