import { expect, test } from '@playwright/test';

test('focused review handles removals, additions, and unchanged code accurately', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
    const codes = [
      'def solve():\n    unused = 1\n    return 2',
      'def solve():\n    return 2',
      'def solve():\n    # Explain this return\n    return 2',
      'def solve():\n    # Explain this return\n    return 2',
    ];
    let next = 0;
    Object.assign(window, {
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
        answer: async (request: { id: string }) => {
          const text = 'The requested code is below.\n```python\n' + codes[next++] + '\n```';
          setTimeout(
            () => listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text })),
            10,
          );
        },
      },
    });
  });
  await page.goto('/');
  const ask = async (question: string) => {
    await page.locator('#question').fill(question);
    await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
    await expect(page.locator('.response-status').last()).toHaveText('Ready');
  };
  await ask('Implement the function');
  await page.getByRole('button', { name: 'Accept changes', exact: true }).click();
  await ask('Remove the unused line');
  const diff = page.getByTestId('code-diff');
  await expect(diff.getByLabel('Before this change', { exact: true })).toContainText('unused = 1');
  await expect(diff.getByLabel('After this change', { exact: true })).toContainText(
    'These lines were removed',
  );
  await page.getByRole('button', { name: 'Accept changes', exact: true }).click();
  await ask('Add a comment');
  await expect(diff.getByLabel('Before this change', { exact: true })).toContainText(
    'this is an addition',
  );
  await expect(diff.getByLabel('After this change', { exact: true })).toContainText(
    '# Explain this return',
  );
  await ask('Return the same implementation');
  await expect(diff.getByRole('status')).toHaveText('No code changes');
  await expect(diff.locator('.change-focus')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(page.getByTestId('working-editor')).not.toContainText('Explain this return');
});

test('review retains usable code height and reachable controls on short windows', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a sample session', exact: true }).click();
  const diff = page.getByTestId('code-diff');
  await expect(diff.getByRole('status')).toContainText('Change');
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1280, height: 650 },
  ]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(async () => (await diff.locator('.diff-editor-host').boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(100);
    await page.getByRole('button', { name: 'Accept changes', exact: true }).hover();
    const bounds = await diff.boundingBox();
    const footer = await page.locator('.code-footer').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y + 1);
  }
});
