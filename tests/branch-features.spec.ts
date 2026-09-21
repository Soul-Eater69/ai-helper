import { expect, test } from '@playwright/test';

test('legacy settings gain story fields and multiple source blocks remain reviewable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let settings: Record<string, unknown> = {
      model: 'test',
      transcriptionModel: 'test',
      language: 'python',
      style: '',
      profile: '',
      prompts: { lld: '', dsa: '', behavioral: '' },
      autoAnswer: false,
      saveHistory: false,
    };
    const listeners = new Set<(event: unknown) => void>();
    Object.assign(window, {
      desktop: {
        isDesktop: true,
        getSettings: async () => ({ hasKey: true, settings }),
        saveSettings: async (value: Record<string, unknown>) => {
          settings = value;
        },
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (fn: (event: unknown) => void) => {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        answer: async (request: { id: string }) => {
          const text =
            'Earlier illustration\n```python\nprint("example")\n```\nFinal implementation\n```python\nprint("final")\n```\n```text\nexpected output: final\n```';
          setTimeout(
            () => listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text })),
            10,
          );
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Test Candidate');
  await page.getByLabel('Routing model', { exact: true }).fill('test-router');
  await page.getByRole('button', { name: 'Add a story' }).click();
  await page.getByLabel('Story 1 title', { exact: true }).fill('Database incident');
  await page
    .getByLabel('action for story 1', { exact: true })
    .fill('I traced the query and added an index.');
  await page.getByLabel('A genuine failure').check();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Test Candidate');
  await expect(page.getByLabel('Routing model', { exact: true })).toHaveValue('test-router');
  await expect(page.getByLabel('action for story 1', { exact: true })).toHaveValue(
    'I traced the query and added an index.',
  );
  await expect(page.getByLabel('A genuine failure')).toBeChecked();
  await page.getByLabel('Story 1 title', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/story-settings.png' });
  await page.getByRole('button', { name: 'Remove story 1' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await page.locator('#question').fill('Show the example, then the final implementation');
  await page.getByRole('button', { name: 'Generate answer' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await expect(page.locator('.markdown')).toContainText('print("example")');
  await expect(page.locator('.markdown')).toContainText('expected output: final');
  await expect(page.locator('.markdown')).not.toContainText('print("final")');
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await expect(page.getByTestId('working-editor')).toContainText('print("final")');
  await expect(page.getByTestId('working-editor')).not.toContainText('print("example")');
});
