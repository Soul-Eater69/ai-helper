import { test, expect } from '@playwright/test';

test('demo code is reviewed, accepted, and undone explicitly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s work through it.' })).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample session' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await expect(page.getByText('Sample session · no API calls')).toBeVisible();
  await expect(page.getByTestId('code-diff').locator('.line-insert').first()).toBeVisible();
  await expect(page.getByTestId('code-diff').locator('.line-delete').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/code-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await expect(page.getByText('Revision accepted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo revision' }).click();
  await expect(page.getByText('Previous code restored')).toBeVisible();
  expect(errors).toEqual([]);
});

test('one workspace and editable prompts work', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Interview session' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Interview modes' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Pin code', exact: true }).click();
  await expect(page.getByTestId('working-editor')).toBeVisible();
  await page.getByRole('button', { name: 'Hide sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Let’s work through it.' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Speaking style').fill('Short natural English');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Speaking style')).toHaveValue('Short natural English');
});

test('stale proposal cannot overwrite manual edits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample session' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Editor', exact: true }).click();
  const editor = page.getByTestId('working-editor').locator('textarea').first();
  await editor.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n# my edit');
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeDisabled();
  await expect(
    page.getByText('Your code changed. Generate a fresh proposal before applying.'),
  ).toBeVisible();
});

test('desktop layout has no horizontal overflow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workspace.png', fullPage: true });
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('mixed follow-ups preserve context, pending revisions and accepted code', async ({ page }) => {
  await page.addInitScript(() => {
    const callbacks: ((event: unknown) => void)[] = [];
    const requests: Record<string, unknown>[] = [];
    const saves: Record<string, unknown>[] = [];
    (window as unknown as { saves: unknown }).saves = saves;
    (window as unknown as { requests: unknown }).requests = requests;
    const settings = {
      model: 'test',
      transcriptionModel: 'test',
      language: 'python',
      style: '',
      profile: '',
      prompts: { lld: '', dsa: '', behavioral: '' },
      autoAnswer: false,
      saveHistory: true,
    };
    Object.assign(window, {
      desktop: {
        isDesktop: true,
        getSettings: async () => ({ settings, hasKey: true }),
        listSessions: async () => [],
        saveSession: async (session: Record<string, unknown>) => {
          saves.push(session);
        },
        onEvent: (callback: (event: unknown) => void) => {
          callbacks.push(callback);
          return () => {};
        },
        cancel: async () => {},
        stopAudio: async () => {},
        answer: async (request: Record<string, unknown>) => {
          requests.push(request);
          const text =
            requests.length === 1
              ? 'A small implementation.\n```python\nclass ParkingLot:\n    pass\n```'
              : 'What was the technical disagreement in this project?';
          setTimeout(
            () => callbacks.forEach((fn) => fn({ type: 'answer.done', id: request.id, text })),
            10,
          );
        },
      },
    });
  });
  await page.goto('/');
  await page.getByText('Requirements & context', { exact: true }).click();
  await page.getByLabel('Pinned context').fill('Single level; no payments');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { saves: Record<string, unknown>[] }).saves.at(-1)?.context,
      ),
    )
    .toBe('Single level; no payments');
  const question = page.locator('#question');
  await question.fill('Implement a parking lot');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await question.fill('Tell me about a disagreement on this design');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect(
    page.getByText('What was the technical disagreement in this project?', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await question.fill('Explain the complexity and how you reached agreement');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { requests: unknown[] }).requests.length))
    .toBe(3);
  const requests = await page.evaluate(
    () => (window as unknown as { requests: Record<string, unknown>[] }).requests,
  );
  expect(requests[2].code).toContain('class ParkingLot');
  expect(requests[2].context).toBe('Single level; no payments');
  expect(requests[2]).not.toHaveProperty('mode');
  expect(requests[2]).not.toHaveProperty('stage');
  expect(JSON.stringify(requests[2].history)).toContain('Implement a parking lot');
  expect(JSON.stringify(requests[2].history)).toContain('Tell me about a disagreement');
  await expect(page.getByRole('region', { name: 'Code workspace' })).toBeVisible();
});
