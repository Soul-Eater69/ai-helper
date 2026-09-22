import { expect, test } from '@playwright/test';

test('speaker selection gates answers, preserves other speech as context and resets on disconnect', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
    const routes: unknown[] = [];
    const answers: unknown[] = [];
    let settings = { transcriptionProvider: 'deepgram', autoAnswer: true };
    Object.assign(window, {
      emitAudio: (event: unknown) => listeners.forEach((fn) => fn(event)),
      routes,
      answers,
      desktop: {
        isDesktop: true,
        getSettings: async () => ({ settings, hasKey: true, hasDeepgramKey: true }),
        saveSettings: async (value: typeof settings) => {
          settings = value;
        },
        setDeepgramKey: async () => {},
        deleteDeepgramKey: async () => {},
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (fn: (event: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        routeSpeech: async (request: unknown) => {
          routes.push(request);
          return { action: 'answer' };
        },
        answer: async (request: unknown) => {
          answers.push(request);
        },
      },
    });
  });
  await page.goto('/');
  const emit = async (event: unknown) => page.evaluate((e) => (window as any).emitAudio(e), event);
  const final = (id: string, text: string, speaker?: number) =>
    emit({ type: 'transcript.final', id, text, speaker, diarized: true });
  await expect(page.getByLabel('Respond to', { exact: true })).toBeVisible();
  await final('first', 'Can you explain BFS?', 0);
  await final('second', 'I use a queue.', 1);
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(0);
  await page.getByLabel('Respond to', { exact: true }).selectOption('0');
  await final('candidate', 'Why would I use a queue?', 1);
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(0);
  await final('question', 'Actually implement DFS.', 0);
  await expect.poll(() => page.evaluate(() => (window as any).answers.length)).toBe(1);
  const request = await page.evaluate(() => (window as any).routes[0]);
  expect(request.text).toBe('Actually implement DFS.');
  expect(request.recentSpeech.join(' ')).toContain('Other speaker: Why would I use a queue?');
  await final('unknown', 'Do something else.');
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(1);
  await page.screenshot({ path: 'test-results/deepgram-speakers.png' });
  await emit({ type: 'audio.status', status: 'error', message: 'Disconnected' });
  await expect(page.getByLabel('Respond to', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Respond to', { exact: true }).locator('option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Deepgram API key')).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Deepgram API key')).toHaveValue('');
  await expect(page.getByLabel('Transcription model', { exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/deepgram-settings.png' });
});
