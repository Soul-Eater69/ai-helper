import { expect, test } from '@playwright/test';

test('first speaker is automatic, completed speech answers without an endpoint, and manual pause survives new speech', async ({
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
        answer: async (request: { id: string }) => {
          answers.push(request);
          listeners.forEach((fn) =>
            fn({ type: 'answer.done', id: request.id, text: 'I would use a queue for BFS.' }),
          );
        },
      },
    });
  });
  await page.goto('/');
  const emit = async (event: unknown) => page.evaluate((e) => (window as any).emitAudio(e), event);
  const final = (id: string, text: string, speaker?: number) =>
    emit({ type: 'transcript.final', id, text, speaker, diarized: true });
  await expect(page.getByLabel('Respond to', { exact: true })).toBeVisible();
  await emit({ type: 'speech.started', id: 'dg-speech', diarized: true });
  await final('first', 'Can you explain BFS?', 0);
  await emit({ type: 'speech.started', id: 'background-noise', diarized: true });
  await expect(page.getByLabel('Respond to', { exact: true })).toHaveValue('0');
  // No endpoint is delivered: finalized text must still reach the answer pipeline.
  await expect.poll(() => page.evaluate(() => (window as any).answers.length)).toBe(1);
  await expect(page.locator('.markdown')).toContainText('I would use a queue');
  await final('candidate', 'Why would I use a queue?', 1);
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(1);
  await emit({ type: 'speech.started', id: 'dg-speech', diarized: true });
  await final('question', 'Actually implement DFS.', 0);
  await expect.poll(() => page.evaluate(() => (window as any).answers.length)).toBe(2);
  const request = await page.evaluate(() => (window as any).routes[1]);
  expect(request.text).toBe('Actually implement DFS.');
  expect(request.recentSpeech.join(' ')).toContain('Other speaker: Why would I use a queue?');
  await page.getByLabel('Respond to', { exact: true }).selectOption('');
  await final('paused', 'Explain DFS.', 0);
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(2);
  await expect(page.getByLabel('Respond to', { exact: true })).toHaveValue('');
  await page.getByLabel('Respond to', { exact: true }).selectOption('1');
  await final('switched', 'Explain sorting.', 1);
  await expect.poll(() => page.evaluate(() => (window as any).answers.length)).toBe(3);
  await final('unknown', 'Do something else.');
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => (window as any).answers.length)).toBe(3);
  await emit({ type: 'audio.status', status: 'connecting' });
  await expect(page.getByLabel('Respond to', { exact: true })).toHaveValue('');
  await final('restart', 'How are you?', 2);
  await expect(page.getByLabel('Respond to', { exact: true })).toHaveValue('2');
  await expect.poll(() => page.evaluate(() => (window as any).answers.length)).toBe(4);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Deepgram API key')).toHaveAttribute('type', 'password');
  await expect(page.getByLabel('Deepgram API key')).toHaveValue('');
  await expect(page.getByLabel('Transcription model', { exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/deepgram-settings.png' });
});
