import { test, expect } from '@playwright/test';

test('demo code is reviewed, accepted, and undone explicitly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your next good answer starts here.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try a sample session' }).click();
  await expect(page.getByRole('button', { name: 'Accept changes' })).toBeEnabled();
  await expect(page.getByText('Sample session · no API calls')).toBeVisible();
  await page.screenshot({ path: 'test-results/code-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Accept changes' }).click();
  await expect(page.getByText('Revision accepted')).toBeVisible();
  await page.getByRole('button', { name: 'Undo revision' }).click();
  await expect(page.getByText('Previous code restored')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mode and stage selection and editable prompts work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Behavioral', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Learning', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Your next good answer starts here.' }),
  ).toBeVisible();
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
