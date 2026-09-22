import { expect, it, vi } from 'vitest';
import { withoutCaptureOverlay } from '../src/main/screenshot';
it.each([false, true])('restores the app after capture, including errors: %s', async (fail) => {
  let visible = true;
  const calls: string[] = [];
  const window = {
    isVisible: () => visible,
    isDestroyed: () => false,
    hide: () => {
      visible = false;
      calls.push('hide');
    },
    show: () => {
      visible = true;
      calls.push('show');
    },
  };
  const result = withoutCaptureOverlay(
    window,
    async () => {
      expect(visible).toBe(false);
      calls.push('capture');
      if (fail) throw new Error('denied');
      return 'image';
    },
    async () => {
      calls.push('settled');
    },
  );
  if (fail) await expect(result).rejects.toThrow('denied');
  else await expect(result).resolves.toBe('image');
  expect(calls).toEqual(['hide', 'settled', 'capture', 'show']);
  expect(visible).toBe(true);
});
it('does not show a window destroyed while capture was pending', async () => {
  let destroyed = false;
  const window = {
    isVisible: () => true,
    isDestroyed: () => destroyed,
    hide: vi.fn(),
    show: vi.fn(),
  };
  await withoutCaptureOverlay(
    window,
    async () => {
      destroyed = true;
      return 'image';
    },
    async () => {},
  );
  expect(window.show).not.toHaveBeenCalled();
});
