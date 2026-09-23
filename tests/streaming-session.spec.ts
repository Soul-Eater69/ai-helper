import { expect, test } from '@playwright/test';

test('continued speech discards preparation and only an approved current turn reaches the UI', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
    const prepared: string[] = [];
    const discarded: string[] = [];
    const decisions: ((value: { action: string }) => void)[] = [];
    const emit = (event: unknown) => listeners.forEach((fn) => fn(event));
    Object.assign(window, {
      streamingTest: {
        emit,
        prepared,
        discarded,
        decide: (index: number) => decisions[index]({ action: 'answer' }),
      },
      desktop: {
        isDesktop: true,
        getSettings: async () => ({
          hasKey: true,
          settings: { earlyPreparation: true, autoAnswer: true },
        }),
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (fn: (event: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        prepareAnswer: async (request: { id: string }) => {
          prepared.push(request.id);
        },
        discardAnswer: async (id: string) => {
          discarded.push(id);
        },
        routeSpeech: async () => new Promise((resolve) => decisions.push(resolve)),
        answer: async (request: { id: string }) => {
          emit({
            type: 'answer.delta',
            id: request.id,
            text: 'I’ll explain the current approach.',
          });
          setTimeout(
            () =>
              emit({
                type: 'answer.done',
                id: request.id,
                text: 'I’ll explain the current approach.',
              }),
            60,
          );
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#question')).toBeVisible();
  const send = (event: unknown) =>
    page.evaluate((event) => (window as any).streamingTest.emit(event), event);
  await send({ type: 'transcript.final', id: 'one', text: 'Explain the approach' });
  await expect
    .poll(() => page.evaluate(() => (window as any).streamingTest.prepared.length))
    .toBe(1);
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  await send({ type: 'speech.started', id: 'two' });
  await expect
    .poll(() => page.evaluate(() => (window as any).streamingTest.discarded.length))
    .toBe(1);
  await page.evaluate(() => (window as any).streamingTest.decide(0));
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  await send({ type: 'transcript.final', id: 'two', text: 'and keep the input unchanged' });
  await expect
    .poll(() => page.evaluate(() => (window as any).streamingTest.prepared.length))
    .toBe(2);
  await page.evaluate(() => (window as any).streamingTest.decide(1));
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(page.locator('.conversation-turn')).toContainText(
    'Explain the approach and keep the input unchanged',
  );
  await expect(page.locator('.conversation-turn')).toContainText(
    'I’ll explain the current approach.',
  );
});
