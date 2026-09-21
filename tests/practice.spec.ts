import { expect, test } from '@playwright/test';

// Mock only Electron/provider I/O; exercise the real session, editor and action controls.
test('practice actions preserve draft, conversation, pending code and manual edits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
    const requests: Record<string, unknown>[] = [];
    Object.assign(window, {
      practiceRequests: requests,
      desktop: {
        isDesktop: true,
        getSettings: async () => ({
          hasKey: true,
          settings: {
            model: 'test',
            transcriptionModel: 'test',
            language: 'python',
            style: '',
            profile: '',
            prompts: { lld: '', dsa: '', behavioral: '' },
            autoAnswer: false,
            saveHistory: false,
          },
        }),
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (fn: (event: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        answer: async (request: Record<string, unknown>) => {
          requests.push(request);
          const text =
            requests.length === 1
              ? 'Can I assume exactly one valid pair?'
              : requests.length === 2
                ? 'I will store earlier values.\n```python\ndef two_sum(nums, target):\n    return [0, 1]\n```'
                : 'Manual review: the fixed indices fail for [1, 2, 4], target 6. No code was executed.';
          const finish = () =>
            listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text }));
          if (requests.length === 3) Object.assign(window, { finishPractice: finish });
          else setTimeout(finish, 10);
        },
      },
    });
  });
  await page.goto('/');
  await page.locator('#question').fill('Two Sum: return the indices, not the values');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect(page.locator('.markdown')).toContainText('Can I assume');
  await page.getByText('Practice tools', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review code', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Explain approach', exact: true })).toBeEnabled();
  await page.locator('#question').fill('Yes, exactly one pair. Please code it.');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await page.locator('#question').fill('Keep my unfinished follow-up');
  await page.getByRole('button', { name: 'Dry run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dry run', exact: true })).toBeDisabled();
  await expect(page.locator('#question')).toHaveValue('Keep my unfinished follow-up');
  await page.evaluate(() => (window as unknown as { finishPractice: () => void }).finishPractice());
  await expect(page.getByRole('button', { name: 'Dry run', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review code', exact: true }).click();
  await expect(page.locator('.response-status').last()).toHaveText('Ready');
  const requests = await page.evaluate(
    () => (window as unknown as { practiceRequests: Record<string, unknown>[] }).practiceRequests,
  );
  expect(requests[2].question).toMatch(/dry run/i);
  expect(requests[2].code).toContain('return [0, 1]');
  expect(requests[2].codeSource).toBe('proposal');
  expect(JSON.stringify(requests[2].history)).toContain('indices, not the values');
  expect(JSON.stringify(requests[2].history)).toContain('exactly one pair');
  expect(requests[3].question).toMatch(/review/i);
  await page.getByRole('button', { name: 'Accept changes' }).click();
  const editor = page.getByTestId('working-editor').locator('textarea').first();
  await editor.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('def two_sum(nums, target):\n    return []');
  await page.getByRole('button', { name: 'Optimize', exact: true }).click();
  await expect(page.locator('.response-status').last()).toHaveText('Ready');
  const last = await page.evaluate(() =>
    (window as unknown as { practiceRequests: Record<string, unknown>[] }).practiceRequests.at(-1),
  );
  expect(last?.code).toContain('return []');
  expect(last?.codeSource).toBe('working');
  expect(last?.question).toMatch(/optimiz/i);
  await expect(page.getByRole('button', { name: 'Accept changes' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/practice-review.png' });
  await page.getByText('Earlier questions').click();
  await page.locator('.recent-turns button').first().click();
  await expect(page.getByText('Practice tools', { exact: true })).toHaveCount(0);
});
