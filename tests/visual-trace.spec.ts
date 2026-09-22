import { expect, test, type Page } from '@playwright/test';
import { dpTrace, treeTrace, traceFence } from './fixtures/visual-traces';

async function supplyAnswers(page: Page, answers: string[]) {
  await page.addInitScript((replies) => {
    const listeners = new Set<(event: unknown) => void>();
    let index = 0;
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
          const text = replies[index++];
          listeners.forEach((fn) =>
            fn({ type: 'answer.delta', id: request.id, text: '```dry-run\n{"version":' }),
          );
          setTimeout(
            () => listeners.forEach((fn) => fn({ type: 'answer.done', id: request.id, text })),
            150,
          );
        },
      },
    });
  }, answers);
  await page.goto('/');
}
async function ask(page: Page, question: string) {
  await page.locator('#question').fill(question);
  await page.getByRole('button', { name: 'Generate answer', exact: true }).click();
}

test('dry runs open as copyable notes with all steps and a compact diagram', async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => Object.assign(window, { copiedTrace: text }) },
    }),
  );
  await supplyAnswers(page, [traceFence(treeTrace)]);
  await ask(page, 'Walk through tree depth');
  const trace = page.getByRole('region', {
    name: 'Visual dry run: Maximum tree depth',
    exact: true,
  });
  await expect(trace.locator('.trace-notebook-step')).toHaveCount(4);
  await expect(trace.locator('svg.trace-graph')).toHaveCount(4);
  await expect(trace.locator('.trace-notebook-write').nth(1)).toHaveText('1 + max(0, 0) = 1');
  await expect(trace.locator('.trace-notebook-step').last()).toContainText(
    'return 1 + max(1, 1) = 2',
  );
  expect((await trace.locator('svg.trace-graph').first().boundingBox())!.width).toBeLessThanOrEqual(
    400,
  );
  await trace.getByRole('button', { name: 'Copy notes for step 2', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { copiedTrace: string }).copiedTrace))
    .toBe('1 + max(0, 0) = 1');
  await trace.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await trace.getByRole('button', { name: 'Next step' }).click();
  await trace.getByRole('button', { name: 'Notes', exact: true }).click();
  await trace.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await expect(trace.locator('.trace-step-label')).toHaveText('Step 2 of 4');
  await trace.getByRole('button', { name: 'Notes', exact: true }).click();
  await trace.locator('.trace-notebook-step').last().scrollIntoViewIfNeeded();
  await expect(trace.locator('.trace-notebook-say').last()).toBeVisible();
  await page.screenshot({ path: 'test-results/dry-run-notebook.png' });
});

test('tree calls and returns stay synchronized with speech, notes and independent conversation history', async ({
  page,
}) => {
  await supplyAnswers(page, [traceFence(treeTrace), traceFence(dpTrace)]);
  await ask(page, 'Walk through the tree depth.');
  const tree = page.getByRole('region', {
    name: 'Visual dry run: Maximum tree depth',
    exact: true,
  });
  await expect(tree).toBeVisible();
  await tree.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await expect(tree.getByRole('button', { name: 'Back', exact: true })).toBeDisabled();
  await tree.getByRole('button', { name: 'Next step' }).click();
  await expect(tree.locator('.trace-speech')).toContainText('Both children of 9 are empty');
  await expect(tree.locator('.trace-write')).toHaveText('1 + max(0, 0) = 1');
  await expect(tree.locator('.trace-node.active')).toHaveAttribute('aria-label', '9: depth 1');
  await expect(tree.locator('.trace-collections')).toContainText('depth(9) → 1');
  // Typing rerenders the parent but must not reset the walkthrough to its first step.
  await page.locator('#question').fill('Next, try DP.');
  await expect(tree.locator('.trace-step-label')).toHaveText('Step 2 of 4');
  await tree.getByRole('button', { name: 'Next step' }).click();
  await tree.getByRole('button', { name: 'Next step' }).click();
  await expect(tree.locator('.trace-write')).toContainText('= 2');
  await expect(tree.getByRole('button', { name: 'Next step' })).toBeDisabled();
  await tree.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(tree.locator('.trace-node.active')).toHaveAttribute('aria-label', '20: depth 1');
  await ask(page, 'Show a DP dry run.');
  const dp = page.getByRole('region', { name: 'Visual dry run: Climbing stairs', exact: true });
  await dp.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await expect(dp.locator('.trace-step-label')).toHaveText('Step 1 of 2');
  await expect(tree.locator('.trace-step-label')).toHaveText('Step 3 of 4');
  await dp.getByRole('button', { name: 'Next step' }).click();
  await expect(dp.locator('.trace-cell.active')).toHaveText('dp[2]2');
  await expect(dp.locator('.trace-write')).toContainText('dp[1] + dp[0] = 2');
  await expect(page.getByRole('button', { name: 'Accept changes' })).toHaveCount(0);
  await dp.evaluate((element) => {
    (element as HTMLElement).style.width = '320px';
  });
  const sizes = await dp.evaluate((element) => ({
    width: element.clientWidth,
    scroll: element.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
  await dp.screenshot({ path: 'test-results/visual-dry-run-dp.png' });
});

test('array marks, graph traversals and grid values render without executing model markup', async ({
  page,
}) => {
  const array = {
    ...dpTrace,
    kind: 'array',
    title: 'Array scan',
    steps: [
      {
        title: 'Remove unmatched bracket',
        say: 'This bracket has no match.',
        write: 'remove index 1',
        active: ['d1'],
        removed: ['d1'],
        collections: [{ label: 'Stack · top first', items: [] }],
      },
    ],
  };
  const graph = {
    ...treeTrace,
    kind: 'graph',
    title: 'Graph traversal',
    edges: treeTrace.edges.map((edge) => ({ ...edge, directed: true })),
  };
  const grid = {
    ...dpTrace,
    kind: 'grid',
    title: 'Grid update',
    nodes: dpTrace.nodes.map((node, i) => ({ ...node, row: Math.floor(i / 2), column: i % 2 })),
  };
  await supplyAnswers(page, [traceFence(array), traceFence(graph), traceFence(grid)]);
  await ask(page, 'Show an array trace');
  await page.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await expect(page.locator('.trace-cell.removed')).toHaveCount(1);
  await expect(page.locator('.trace-collections')).toContainText('Empty');
  await ask(page, 'Show graph traversal');
  const diagram = page.getByRole('region', {
    name: 'Visual dry run: Graph traversal',
    exact: true,
  });
  await diagram.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await diagram.getByRole('button', { name: 'Next step' }).click();
  await expect(diagram.locator('.trace-edge.active')).toHaveCount(1);
  await diagram.evaluate((element) => {
    (element as HTMLElement).style.width = '320px';
  });
  await diagram.screenshot({ path: 'test-results/visual-dry-run-tree.png' });
  await ask(page, 'Show the grid');
  const cells = page
    .getByRole('region', { name: 'Visual dry run: Grid update', exact: true })
    .locator('.trace-notebook-step')
    .first()
    .locator('.trace-cell');
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(2)).toHaveCSS('grid-row-start', '2');
});

test('invalid diagram cannot block a valid code proposal or remaining answer', async ({ page }) => {
  await supplyAnswers(page, [
    '> I compute each child depth first.\n\n```python\ndef depth(node):\n    return 0 if node is None else 1 + max(depth(node.left), depth(node.right))\n```\n\n```dry-run\n{"version":2}\n```\n\nThe empty tree returns zero.',
  ]);
  await ask(page, 'Implement maximum depth.');
  await expect(
    page.getByText('This walkthrough could not be drawn.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('The empty tree returns zero.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeVisible();
});

test('finishing a streamed answer preserves the step already selected in its completed diagram', async ({
  page,
}) => {
  const trace = traceFence(treeTrace);
  await page.addInitScript((text) => {
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
          listeners.forEach((fn) => fn({ type: 'answer.delta', id: request.id, text }));
          Object.assign(window, {
            finishTestAnswer: () =>
              listeners.forEach((fn) =>
                fn({
                  type: 'answer.done',
                  id: request.id,
                  text: text + '\n\nShall I implement that?',
                }),
              ),
          });
        },
      },
    });
  }, trace);
  await page.goto('/');
  await ask(page, 'Explain the tree.');
  const diagram = page.getByRole('region', {
    name: 'Visual dry run: Maximum tree depth',
    exact: true,
  });
  await diagram.getByRole('button', { name: 'Walkthrough', exact: true }).click();
  await diagram.getByRole('button', { name: 'Next step' }).click();
  await expect(diagram.locator('.trace-step-label')).toHaveText('Step 2 of 4');
  await page.evaluate(() =>
    (window as unknown as { finishTestAnswer: () => void }).finishTestAnswer(),
  );
  await expect(page.getByText('Shall I implement that?', { exact: true })).toBeVisible();
  await expect(diagram.locator('.trace-step-label')).toHaveText('Step 2 of 4');
});

test('LLD object walkthrough shows a rejected operation and preserves working code', async ({
  page,
}) => {
  const trace = {
    version: 1,
    kind: 'graph',
    title: 'Expired pickup code',
    input:
      'Code A7 expires at 10:00. Customer attempts pickup at 10:01. Compartment C1 contains a package.',
    nodes: [
      { id: 'locker', label: 'Locker', row: 0, column: 0 },
      { id: 'token', label: 'Code A7', row: 1, column: 0 },
      { id: 'slot', label: 'Compartment C1', row: 1, column: 1 },
    ],
    edges: [
      { from: 'locker', to: 'token' },
      { from: 'token', to: 'slot' },
    ],
    steps: [
      {
        title: 'Look up the pickup code',
        say: 'I look up A7 and find its record. It points to compartment C1, which still contains a package.',
        write: 'Call Locker.pickup("A7")\nCode A7 expires at 10:00\nCompartment C1: occupied',
        active: ['locker', 'token'],
        values: [
          { id: 'token', value: 'expires 10:00' },
          { id: 'slot', value: 'occupied' },
        ],
      },
      {
        title: 'Reject the expired code',
        say: 'It is 10:01, so the code has expired. I reject the pickup. The package is still inside, so C1 stays occupied.',
        write:
          '10:01 >= 10:00: code expired\nReturn an expired-code error\nCompartment C1 stays occupied',
        active: ['token'],
        values: [
          { id: 'token', value: 'expired' },
          { id: 'slot', value: 'occupied' },
        ],
      },
    ],
  };
  await supplyAnswers(page, [
    '## Class design\n\n> The code and compartment keep separate state.\n\n```pseudocode\nLocker.pickup(code) -> success or error\n```\n\n' +
      traceFence(trace),
  ]);
  await ask(page, 'Walk through an expired pickup code');
  await expect(page.getByTestId('pseudocode')).toContainText('Locker.pickup(code)');
  const view = page.getByRole('region', {
    name: 'Visual dry run: Expired pickup code',
    exact: true,
  });
  await expect(view.locator('svg.trace-graph')).toHaveCount(2);
  await expect(view.locator('.trace-notebook-step').last()).toContainText(
    'Compartment C1 stays occupied',
  );
  await expect(
    page.getByText('The full version is in the code workspace for review.', { exact: true }),
  ).toHaveCount(0);
});

test('requirements accumulate beside chat, corrections replace notes, and new sessions clear them', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async (text: string) => Object.assign(window, { copiedNotes: text }) },
    }),
  );
  const response = (requirements: string[], outOfScope: string[] = []) =>
    '```requirements\n' +
    JSON.stringify({ version: 1, topic: 'Amazon Locker', requirements, outOfScope }) +
    '\n```\n\nWhat size matching should I use?';
  await supplyAnswers(page, [
    response(['One physical location.']),
    response(['One physical location.', 'Exact size match.'], ['Notifications.']),
    response(['One physical location.', 'Smallest available size that fits.'], ['Notifications.']),
  ]);
  const panel = page.getByRole('region', { name: 'Live requirements' });
  await expect(panel.getByRole('heading', { name: 'Requirements', exact: true })).toBeVisible();
  await ask(page, 'One physical location');
  await expect(panel).toContainText('One physical location.');
  const compactWidth = (await panel.boundingBox())!.width;
  await panel.getByRole('button', { name: 'Expand notes' }).click();
  await expect(panel.getByRole('button', { name: 'Collapse notes' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect((await panel.boundingBox())!.width).toBeGreaterThan(compactWidth);
  await panel.getByRole('button', { name: 'Collapse notes' }).click();
  await expect(panel.getByRole('button', { name: 'Expand notes' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  await ask(page, 'Exact match, notifications are out of scope');
  await expect(panel.locator('li')).toHaveCount(3);
  await expect(panel).toContainText('Notifications.');
  await ask(page, 'Actually use the smallest available size that fits');
  await expect(panel).not.toContainText('Exact size match.');
  await expect(panel).toContainText('Smallest available size that fits.');
  await panel.getByRole('button', { name: 'Copy notes' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { copiedNotes: string }).copiedNotes))
    .toContain('Out of scope\n- Notifications.');
  await expect(page.locator('.language-requirements')).toHaveCount(0);
  await page.getByRole('button', { name: 'New session', exact: true }).click();
  await expect(panel.locator('li')).toHaveCount(0);
});

test('composer sends with Enter, preserves Shift+Enter and IME composition', async ({ page }) => {
  await supplyAnswers(page, ['First answer', 'Second answer']);
  const input = page.locator('#question');
  await input.fill('First line');
  await input.press('Shift+Enter');
  await input.press('a');
  await expect(input).toHaveValue('First line\na');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(page.locator('.conversation-turn')).toHaveCount(0);
  await input.press('Enter');
  await expect(page.locator('.conversation-turn')).toHaveCount(1);
  await expect(page.locator('.response-status')).toHaveText('Ready');
  await input.fill('Follow up');
  await input.press('Control+Enter');
  await expect(page.locator('.conversation-turn')).toHaveCount(2);
});

test('code can expand, close and reopen without losing its proposal', async ({ page }) => {
  await supplyAnswers(page, ['Here is the implementation.\n```python\nprint("hello")\n```']);
  await ask(page, 'Implement it');
  const code = page.getByRole('region', { name: 'Code workspace', exact: true });
  await expect(code).toBeVisible();
  const normal = (await code.boundingBox())!.width;
  await page.getByRole('button', { name: 'Expand code workspace', exact: true }).click();
  await expect.poll(async () => (await code.boundingBox())!.width).toBeGreaterThan(normal);
  await page.getByRole('button', { name: 'Restore code width', exact: true }).click();
  await expect.poll(async () => (await code.boundingBox())!.width).toBeCloseTo(normal, 0);
  await page.getByRole('button', { name: 'Close code workspace', exact: true }).click();
  await expect(code).toHaveCount(0);
  await page.getByRole('button', { name: 'Show code', exact: true }).click();
  await expect(code.getByRole('button', { name: 'Accept changes' })).toBeVisible();
  await page.setViewportSize({ width: 850, height: 950 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
