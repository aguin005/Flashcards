import { expect, type Page } from '@playwright/test';

export const fixture = (name: string) => `tests/fixtures/${name}`;

/** Upload a fixture PDF and wait for the extraction review screen. */
export async function importPdf(page: Page, file = 'vocab-notes.pdf') {
  await page.goto('#/upload');
  await page.getByTestId('file-input').setInputFiles(fixture(file));
  await expect(page).toHaveURL(/#\/upload\/imp_/);
  await expect(page.getByTestId('entry-row').first()).toBeVisible();
}

/** Import the study-guide fixture and save it as a set. Returns the set id. */
export async function createSetFromPdf(page: Page, title = 'Cell Biology'): Promise<string> {
  await importPdf(page);
  await page.locator('#set-title').fill(title);
  await page.getByTestId('save-set').click();
  await expect(page).toHaveURL(/#\/sets\/s_/);
  await expect(page.getByTestId('card-row')).toHaveCount(11);
  return page.url().split('/sets/')[1];
}

export const SPANISH: [string, string][] = [
  ['perro', 'dog'],
  ['gato', 'cat'],
  ['pájaro', 'bird'],
  ['caballo', 'horse'],
];

/** Create a set by hand through the editor. Returns the set id. */
export async function createManualSet(page: Page, title: string, pairs: [string, string][]): Promise<string> {
  await page.goto('#/sets/new');
  await page.locator('#title').fill(title);
  for (let i = 3; i < pairs.length; i++) await page.getByRole('button', { name: 'Add card' }).click();
  const terms = page.locator('textarea[id^="term-"]');
  const defs = page.locator('textarea[id^="def-"]');
  for (const [i, [term, def]] of pairs.entries()) {
    await terms.nth(i).fill(term);
    await defs.nth(i).fill(def);
  }
  await page.getByTestId('save-editor').click();
  await expect(page).toHaveURL(/#\/sets\/s_/);
  await expect(page.getByTestId('card-row')).toHaveCount(pairs.length);
  return page.url().split('/sets/')[1];
}

/** Collect uncaught errors and failed same-origin requests during a test. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  page.on('requestfailed', (r) => {
    if (r.url().startsWith('http://localhost')) errors.push(`requestfailed: ${r.url()}`);
  });
  return errors;
}
