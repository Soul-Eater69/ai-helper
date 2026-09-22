import { test, expect, type Page } from '@playwright/test';
const pixel =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function setup(page: Page) {
  await page.addInitScript((dataUrl) => {
    const listeners = new Set<(event: unknown) => void>();
    const requests: unknown[] = [];
    Object.assign(window, {
      imageRequests: requests,
      desktop: {
        isDesktop: true,
        getSettings: async () => ({
          hasKey: true,
          settings: { model: 'gpt-5.6-sol', autoAnswer: false },
        }),
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (fn: (event: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        answer: async (request: { id: string }) => {
          requests.push(request);
          listeners.forEach((fn) =>
            fn({
              type: 'answer.done',
              id: request.id,
              text: 'The image asks for an ordering of courses. I’ll track the prerequisites.',
            }),
          );
        },
        listCaptureSources: async () => [
          { id: 'screen:1', name: 'Screen 1', preview: dataUrl },
          { id: 'window:2', name: 'Question window', preview: dataUrl },
        ],
        captureImage: async (id: string) => ({
          id: 'capture-1',
          name: id === 'window:2' ? 'Question window' : 'Screen 1',
          dataUrl,
        }),
      },
    });
  }, pixel);
  await page.goto('/');
}
test('capture previews the chosen window, sends image-only questions, and preserves image follow-up context', async ({
  page,
}) => {
  await setup(page);
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await expect(page.locator('.question-images img')).toHaveAttribute('alt', 'Question window');
  expect(
    await page.evaluate(
      () => (window as unknown as { imageRequests: unknown[] }).imageRequests.length,
    ),
  ).toBe(0);
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  await expect(page.locator('.sent-images img')).toHaveCount(1);
  await page.locator('#question').fill('Why does that work?');
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  const requests = await page.evaluate(
    () =>
      (
        window as unknown as {
          imageRequests: { images: unknown[]; history: { images?: unknown[] }[] }[];
        }
      ).imageRequests,
  );
  expect(requests[0].images).toHaveLength(1);
  expect(requests[1].images).toHaveLength(0);
  expect(requests[1].history.some((item) => item.images?.length === 1)).toBe(true);
});
test('paste attaches an image; removal and capture cancellation send nothing', async ({ page }) => {
  await setup(page);
  await page.locator('#question').evaluate(async (element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 50;
    canvas.getContext('2d')!.fillText('Question', 5, 20);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
    const data = new DataTransfer();
    data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('.question-images img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove image pasted.png' }).click();
  await expect(page.getByRole('button', { name: 'Generate answer', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel capture' }).click();
  await expect(page.locator('.capture-picker')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { imageRequests: unknown[] }).imageRequests.length,
    ),
  ).toBe(0);
});

test('a cancelled in-flight capture cannot attach its late result', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.desktop!.captureImage = () =>
      new Promise((resolve) => Object.assign(window, { finishCapture: resolve }));
  });
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel capture' }).click();
  await page.evaluate(
    (dataUrl) =>
      (window as unknown as { finishCapture: (image: unknown) => void }).finishCapture({
        id: 'late',
        name: 'Late image',
        dataUrl,
      }),
    pixel,
  );
  await expect(page.locator('.question-images img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate answer', exact: true })).toBeDisabled();
});

test('new sessions clear attached images and invalid uploads explain the problem', async ({
  page,
}) => {
  await setup(page);
  await page
    .getByLabel('Upload question images')
    .setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByText('Use a PNG, JPEG or WebP image.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await expect(page.locator('.question-images img')).toHaveCount(1);
  await page.getByRole('button', { name: 'New session', exact: true }).click();
  await expect(page.locator('.question-images img')).toHaveCount(0);
});

test('failed capture closes stale choices and allows a fresh retry', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const original = window.desktop!.captureImage;
    let first = true;
    window.desktop!.captureImage = async (id) => {
      if (first) {
        first = false;
        throw new Error('Capture failed');
      }
      return original(id);
    };
  });
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await expect(page.locator('.capture-picker')).toHaveCount(0);
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await expect(page.locator('.question-images img')).toHaveCount(1);
  await page.getByRole('button', { name: 'Preview image Question window' }).click();
  await expect(page.getByAltText('Question image preview')).toBeVisible();
  await page.getByRole('button', { name: 'Close preview' }).click();
});

test('remove from preview closes it and removes the draft attachment', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await page.getByRole('button', { name: 'Preview image Question window' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove image', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.question-images img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Generate answer', exact: true })).toBeDisabled();
});

test('removing a sent image excludes it from subsequent request history', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Capture question', exact: true }).click();
  await page.getByRole('button', { name: 'Question window', exact: true }).click();
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  await page.getByRole('button', { name: 'Remove sent image Question window' }).click();
  await expect(page.locator('.sent-images')).toHaveCount(0);
  await page.locator('#question').fill('Explain the approach');
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  const history = await page.evaluate(
    () =>
      (
        window as unknown as {
          imageRequests: { history: { images?: unknown[] }[] }[];
        }
      ).imageRequests[1].history,
  );
  expect(history.every((item) => !item.images?.length)).toBe(true);
});
