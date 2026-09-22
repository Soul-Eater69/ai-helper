import { expect, test } from '@playwright/test';

test('spoken guidance and dry-run state are visually separate and fit the panel', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const listeners = new Set<(event: unknown) => void>();
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
          const text =
            '> Yeah, checking first means I can only match an earlier element. That handles two separate threes correctly.\n\n## Algorithm\n\n```pseudocode\nFOR each value\n    IF complement is in seen\n        RETURN matching indices\n    STORE value and index\n```\n\n## Dry run\n\n| Step | Write / state | Say aloud |\n| --- | --- | --- |\n| 1 | `nums = [3, 3], target = 6, seen = {}` | I start with an empty map. |\n| 2 | `i = 0, need = 3` → store `{3: 0}` | There is no earlier three, so I save this one. |\n| 3 | `i = 1, need = 3` → return `[0, 1]` | Now the earlier three gives me a pair of different indices. |\n\n## Complexity\n\nExpected time: **O(n)** · Extra space: **O(n)**';
          setTimeout(
            () => listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text })),
            10,
          );
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Pin code', exact: true }).click();
  await page.locator('#question').fill('Why does checking first handle duplicates?');
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  const speech = page.getByTestId('spoken-guidance');
  await expect(speech).toContainText('Say this');
  await expect(speech).toContainText('Yeah, checking first');
  await expect(page.getByTestId('pseudocode')).toContainText('RETURN matching indices');
  await expect(page.getByRole('button', { name: 'Accept changes' })).toHaveCount(0);
  const table = page.getByRole('table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table.getByRole('columnheader', { name: 'Say aloud' })).toBeVisible();
  await expect(
    table.getByRole('cell', {
      name: 'Now the earlier three gives me a pair of different indices.',
    }),
  ).toBeVisible();
  await expect(page.locator('.markdown')).not.toContainText('| --- |');
  await page.screenshot({ path: 'test-results/answer-guidance.png' });
  await page.locator('#question').fill('Explain the complexity next');
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
  await expect(page.locator('.conversation-turn').first()).toContainText(
    'Why does checking first handle duplicates?',
  );
  await expect(page.locator('.conversation-turn').first().getByRole('table')).toHaveCount(1);
  await expect(page.locator('.conversation-turn').last()).toContainText(
    'Explain the complexity next',
  );
  await page.getByText('Earlier questions', { exact: false }).click();
  const firstQuestion = page.locator('.recent-turns button').first();
  await firstQuestion.click();
  await expect
    .poll(() => page.locator('.answer-scroll').evaluate((el) => el.scrollTop))
    .toBeLessThan(40);
  await page.locator('.answer-scroll').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await firstQuestion.click();
  await expect
    .poll(() => page.locator('.answer-scroll').evaluate((el) => el.scrollTop))
    .toBeLessThan(40);
  await page.getByRole('button', { name: 'Latest response' }).click();
  await expect
    .poll(() => page.locator('.answer-scroll').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  await page.setViewportSize({ width: 1100, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const cell = page
    .getByRole('table')
    .last()
    .getByRole('cell', { name: 'Now the earlier three gives me a pair of different indices.' });
  await cell.scrollIntoViewIfNeeded();
  await expect(cell).toBeVisible();
  await page.screenshot({ path: 'test-results/answer-guidance-narrow.png' });
});

test('saved conversations restore every saved exchange into the main feed', async ({ page }) => {
  await page.addInitScript(() => {
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
        listSessions: async () => [
          {
            id: 'saved',
            title: 'Yesterday’s practice',
            context: '',
            language: 'python',
            updatedAt: new Date().toISOString(),
            code: '# saved code',
            turns: [
              {
                id: 'one',
                question: 'How do duplicates work?',
                answer: '> I check earlier elements first.',
              },
              { id: 'two', question: 'And the complexity?', answer: '> Expected linear time.' },
            ],
          },
        ],
        onEvent: () => () => {},
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved sessions' }).click();
  await expect(page.getByText('Saving is off.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Yesterday’s practice', exact: true }).click();
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
  await expect(page.locator('.conversation-turn').first()).toContainText(
    'I check earlier elements first.',
  );
  await expect(page.locator('.conversation-turn').last()).toContainText('Expected linear time.');
  await page.getByText('Earlier questions', { exact: false }).click();
  await page.locator('.recent-turns button').first().click();
  await expect(page.getByRole('heading', { name: 'How do duplicates work?' })).toBeInViewport();
});
