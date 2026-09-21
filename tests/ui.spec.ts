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
          return () => {
            const index = callbacks.indexOf(callback);
            if (index >= 0) callbacks.splice(index, 1);
          };
        },
        cancel: async () => {},
        cancelSpeech: async () => {},
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

test('speech triggers answers without Generate and handles clarification replies', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const callbacks: ((event: unknown) => void)[] = [];
    const routed: Record<string, unknown>[] = [];
    const answered: Record<string, unknown>[] = [];
    Object.assign(window, {
      speechTest: {
        routed,
        answered,
        emit: (event: unknown) => callbacks.forEach((fn) => fn(event)),
      },
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
            autoAnswer: true,
            saveHistory: false,
          },
        }),
        listSessions: async () => [],
        cancel: async () => {},
        cancelSpeech: async () => {},
        stopAudio: async () => {},
        onEvent: (callback: (event: unknown) => void) => {
          callbacks.push(callback);
          return () => {
            const index = callbacks.indexOf(callback);
            if (index >= 0) callbacks.splice(index, 1);
          };
        },
        routeSpeech: async (request: Record<string, unknown>) => {
          routed.push(request);
          return {
            action:
              request.text === 'Explain this design' && !request.finalize
                ? 'wait'
                : request.text === 'Thanks'
                  ? 'ignore'
                  : 'answer',
          };
        },
        answer: async (request: Record<string, unknown>) => {
          answered.push(request);
          setTimeout(
            () =>
              callbacks.forEach((fn) =>
                fn({
                  type: 'answer.done',
                  id: request.id,
                  text:
                    answered.length === 1
                      ? 'How many exits should we support?'
                      : 'Okay, we will support two exits.',
                }),
              ),
            10,
          );
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.getByText('API key saved')).toBeVisible();
  const emit = (text: string) =>
    page.evaluate((text) => {
      (window as unknown as { speechTest: { emit: (event: unknown) => void } }).speechTest.emit({
        type: 'transcript.final',
        id: crypto.randomUUID(),
        text,
      });
    }, text);
  await emit('A parking lot for cars');
  await expect(page.getByText('How many exits should we support?', { exact: true })).toBeVisible();
  await emit('Two exits');
  await expect(page.getByText('Okay, we will support two exits.', { exact: true })).toBeVisible();
  await emit('Thanks');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { speechTest: { routed: unknown[] } }).speechTest.routed.length,
      ),
    )
    .toBe(3);
  const state = await page.evaluate(() => {
    const state = (
      window as unknown as {
        speechTest: { routed: Record<string, unknown>[]; answered: unknown[] };
      }
    ).speechTest;
    return {
      request: state.routed[1],
      answers: state.answered.length,
      answerRequest: state.answered[1],
    };
  });
  expect(state.answers).toBe(2);
  expect(state.answerRequest).toMatchObject({ speechContext: ['A parking lot for cars'] });
  expect(JSON.stringify(state.request.history)).toContain('How many exits');
  expect(state.request.recentSpeech).toEqual(['A parking lot for cars']);
  await emit('Explain this design');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { speechTest: { answered: unknown[] } }).speechTest.answered
              .length,
        ),
      { timeout: 8000 },
    )
    .toBe(3);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { speechTest: { routed: Record<string, unknown>[] } }
        ).speechTest.routed.at(-1)?.finalize,
    ),
  ).toBe(true);
});

for (const acceptFirst of [false, true]) {
  test(`successive revisions highlight against the previous ${acceptFirst ? 'accepted code' : 'proposal'}`, async ({
    page,
  }) => {
    const first = [
      'class ParkingLot:',
      '    capacity = 10',
      ...Array.from({ length: 35 }, (_, i) => `    spot_${i} = ${i}`),
      '    exits = 1',
    ].join('\n');
    const second = first
      .replace('capacity = 10', 'capacity = 20')
      .replace('exits = 1', 'exits = 2');
    await page.addInitScript(
      ({ first, second }) => {
        const listeners = new Set<(event: unknown) => void>();
        const requests: { code: string; id: string }[] = [];
        Object.assign(window, {
          revisionRequests: requests,
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
            onEvent: (callback: (event: unknown) => void) => {
              listeners.add(callback);
              return () => listeners.delete(callback);
            },
            answer: async (request: { code: string; id: string }) => {
              requests.push(request);
              const text =
                'Updated implementation.\n```python\n' +
                (requests.length === 1
                  ? first
                  : requests.length === 2
                    ? second
                    : second.replace('20', '30')) +
                '\n```';
              const finish = () =>
                listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text }));
              if (requests.length === 4) Object.assign(window, { releaseRevision: finish });
              else setTimeout(finish, 10);
            },
          },
        });
      },
      { first, second },
    );
    await page.goto('/');
    await page.locator('#question').fill('Implement a parking lot');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
    if (acceptFirst) await page.getByRole('button', { name: 'Accept changes' }).click();
    await page.locator('#question').fill('Increase the capacity to twenty');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { revisionRequests: { code: string }[] }).revisionRequests.length,
        ),
      )
      .toBe(2);
    const codeSent = await page.evaluate(
      () =>
        (window as unknown as { revisionRequests: { code: string }[] }).revisionRequests[1].code,
    );
    expect(codeSent).toBe(first);
    const diff = page.getByTestId('code-diff');
    await expect(diff.locator('.line-insert').first()).toBeVisible();
    await expect(diff.locator('.line-delete').first()).toBeVisible();
    await expect(diff.locator('.view-lines')).toContainText(['capacity = 10']);
    await expect(diff.locator('.view-lines')).toContainText(['capacity = 20']);
    await expect(diff.getByRole('status')).toHaveText('Change 1 of 2');
    await expect(diff.locator('.diff-counts')).toContainText('+2');
    await expect(diff.locator('.diff-counts')).toContainText('−2');
    await diff.getByRole('button', { name: 'Next change' }).click();
    await expect(diff.getByRole('status')).toHaveText('Change 2 of 2');
    await expect(diff.locator('.view-lines')).toContainText(['exits = 2']);
    await diff.getByRole('button', { name: 'Previous change' }).click();
    await expect(diff.getByRole('status')).toHaveText('Change 1 of 2');
    await page.getByRole('button', { name: 'Accept changes' }).click();
    await expect(page.getByTestId('working-editor')).toContainText('capacity = 20');
    await page.locator('#question').fill('Now increase capacity to thirty');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { revisionRequests: { code: string }[] }).revisionRequests.length,
        ),
      )
      .toBe(3);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { revisionRequests: { code: string }[] }).revisionRequests[2].code,
      ),
    ).toBe(second);
    await expect(diff.locator('.line-insert').first()).toBeVisible();
    await expect(diff.locator('.line-delete').first()).toBeVisible();
    await expect(diff.locator('.view-lines')).toContainText(['capacity = 20']);
    await expect(diff.locator('.view-lines')).toContainText(['capacity = 30']);
    await page.locator('#question').fill('Revise this again');
    await page.getByRole('button', { name: 'Generate answer' }).click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { revisionRequests: unknown[] }).revisionRequests.length,
        ),
      )
      .toBe(4);
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await page.evaluate(() =>
      (window as unknown as { releaseRevision: () => void }).releaseRevision(),
    );
    await expect(page.getByRole('button', { name: 'Accept changes' })).toHaveCount(0);
    await expect(page.getByTestId('working-editor')).toContainText('capacity = 20');
  });
}
