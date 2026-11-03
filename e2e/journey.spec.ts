import { expect, test } from '@playwright/test';

test('demo journey: edit, connect, overlays, validate, plan, simulate, export', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByLabel('Project name')).toHaveValue('Customer Notifications');

  // Select Public API and rename it
  await page.getByTestId('node-Public API').click();
  await page.locator('#n-name').fill('Public API v2');
  await expect(page.getByTestId('node-Public API v2')).toBeVisible();

  // Add a worker and connect it to the event bus
  await page.getByRole('button', { name: /^Worker/ }).click();
  const worker = page.getByTestId('node-Worker 2');
  await expect(worker).toBeVisible();
  await page.locator('#n-name').fill('Audit Worker');
  const audit = page.getByTestId('node-Audit Worker');
  const bus = page.getByTestId('node-Notification Events');
  await audit.scrollIntoViewIfNeeded();
  const src = await audit.locator('.react-flow__handle.source').boundingBox();
  const dst = await bus.locator('.react-flow__handle.target').boundingBox();
  await page.mouse.move(src!.x + src!.width / 2, src!.y + src!.height / 2);
  await page.mouse.down();
  await page.mouse.move(dst!.x + dst!.width / 2, dst!.y + dst!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByLabel('Relationship type')).toHaveValue('subscribes');

  // Overlays: Production conflicts with Development
  await page.getByRole('button', { name: 'Overlays', exact: true }).click();
  await page.getByLabel('Enable Production').check();
  await expect(page.getByText(/unresolved conflict/)).toBeVisible();
  await page.getByRole('button', { name: 'Generate plan' }).first().click();
  await expect(page.locator('.banner.error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploy simulation' }).first()).toBeDisabled();

  // Resolve: disable Development, enable Restricted Data
  await page.getByRole('button', { name: 'Overlays', exact: true }).click();
  await page.getByLabel('Enable Development').uncheck();
  await page.getByLabel('Enable Restricted Data').check();
  await expect(page.getByText('Resolved preview')).toBeVisible();
  await expect(page.locator('.changes li').first()).toContainText('Production');

  // Effective tab shows provenance
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByTestId('node-Customer Database').click();
  await page.getByRole('tab', { name: 'Effective' }).click();
  await expect(page.locator('.eff')).toContainText('Production');
  await expect(page.locator('.eff')).toContainText('Restricted Data');

  // Validation: HA unsupported on small tier, with a focus action
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/high availability is not supported/)).toBeVisible();
  await page.getByRole('button', { name: 'Focus' }).first().click();
  await page.getByRole('tab', { name: 'Configuration' }).click();
  await page.locator('#cfg-tier').selectOption('medium');

  // Plan stale/ready and simulation
  await page.getByRole('button', { name: 'Generate plan' }).first().click();
  await expect(page.getByText('ready', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/illustrative estimate/i).first()).toBeVisible();
  await page.getByRole('button', { name: 'Deploy simulation' }).last().click();
  await expect(page.getByText(/Simulated run succeeded/)).toBeVisible();
  await expect(page.getByText('Simulation completed.')).toBeVisible();

  // Export
  const download = page.waitForEvent('download');
  await page.getByLabel('More actions').click();
  await page.getByRole('menuitem', { name: /Export JSON/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.gnikniht\.json$/);

  // Reload restores saved project
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId('node-Public API v2')).toBeVisible();

  expect(errors).toEqual([]);
});

test('negative path: invalid relationship blocks the plan', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const edgeLabel = page.locator('.react-flow__edge-textwrapper', { hasText: 'calls_model' });
  await edgeLabel.click();
  await page.getByLabel('Relationship type').selectOption('publishes');
  await page.getByRole('button', { name: 'Generate plan' }).first().click();
  await expect(page.locator('.banner.error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Deploy simulation' }).first()).toBeDisabled();
});

test('platform-kit template loads and flags insecure MCP', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Load platform-kit template/ }).click();
  await expect(page.getByTestId('node-RAG Service')).toBeVisible();
  await expect(page.getByTestId('node-Key Vault (OpenBao)')).toBeVisible();
});
