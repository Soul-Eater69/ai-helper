type CaptureWindow = { isVisible(): boolean; isDestroyed(): boolean; hide(): void; show(): void };

/** Let the OS remove our picker before a monitor snapshot, restoring even on failure. */
export async function withoutCaptureOverlay<T>(
  window: CaptureWindow | undefined,
  capture: () => Promise<T>,
  pause = () => new Promise<void>((resolve) => setTimeout(resolve, 200)),
): Promise<T> {
  const restore = window && !window.isDestroyed() && window.isVisible();
  try {
    if (restore) {
      window.hide();
      await pause();
    }
    return await capture();
  } finally {
    if (restore && !window.isDestroyed()) window.show();
  }
}
