// Regenerates the README screenshots. Usage: npm run build && npm run screenshot
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const url = 'http://localhost:4174';
const server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { stdio: 'ignore' });
const wait = async () => {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start');
};

mkdirSync('docs/screenshots', { recursive: true });
try {
  await wait();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.react-flow__node');
  await page.getByTestId('node-Public API').click();
  await page.screenshot({ path: 'docs/screenshots/design.png' });

  await page.getByRole('button', { name: 'Overlays', exact: true }).click();
  await page.getByLabel('Enable Development').uncheck();
  await page.getByLabel('Enable Production').check();
  await page.getByLabel('Enable Restricted Data').check();
  await page.screenshot({ path: 'docs/screenshots/overlays.png' });

  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByTestId('node-Customer Database').click();
  await page.getByRole('tab', { name: 'Configuration' }).click();
  await page.locator('#cfg-tier').selectOption('medium');
  await page.getByRole('button', { name: 'Generate plan' }).first().click();
  await page.getByRole('button', { name: 'Deploy simulation' }).last().click();
  await page.waitForSelector('[data-testid=timeline]');
  await page.locator('.center').evaluate((e) => e.scrollTo(0, 0));
  await page.screenshot({ path: 'docs/screenshots/plan-run.png' });

  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /Load platform-kit template/ }).click();
  await page.waitForSelector('[data-testid="node-RAG Service"]');
  await page.getByTestId('node-MCP Tools Server').click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/screenshots/platform-kit.png' });
  await browser.close();
} finally {
  server.kill();
}
