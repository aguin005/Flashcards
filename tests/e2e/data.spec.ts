import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createManualSet, createSetFromPdf, SPANISH, watchErrors } from './helpers';

test.describe('Study set management and data', () => {
  test('create, edit, search, duplicate, and delete sets', async ({ page }) => {
    const errors = watchErrors(page);
    const setId = await createManualSet(page, 'Spanish', SPANISH);

    // Edit: rename, add a card with paste import, delete a card.
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.locator('#title').fill('Spanish animals');
    await page.getByRole('button', { name: 'Paste terms' }).click();
    await page.getByLabel('Text to import').fill('vaca\tcow\noveja: sheep');
    await page.getByRole('button', { name: 'Add 2 cards' }).click();
    await page.getByRole('button', { name: 'Delete card 1' }).click();
    await page.getByTestId('save-editor').click();
    await expect(page.getByRole('heading', { name: 'Spanish animals' })).toBeVisible();
    await expect(page.getByTestId('card-row')).toHaveCount(5);
    await expect(page.getByText('perro')).toHaveCount(0);

    // Search within the set, star a card, filter starred.
    await page.getByLabel('Search cards in this set').fill('sheep');
    await expect(page.getByTestId('card-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Star oveja' }).click();
    await page.getByLabel('Search cards in this set').fill('');
    await page.getByRole('radio', { name: 'Starred 1' }).click();
    await expect(page.getByTestId('card-row')).toHaveCount(1);
    await page.getByRole('radio', { name: 'All' }).click();
    await page.getByLabel('Sort cards').selectOption('alpha');
    await expect(page.getByTestId('card-row').first()).toContainText('caballo');

    // Global search finds the set by a term.
    await page.getByLabel('Search study sets').fill('oveja');
    await expect(page.getByRole('option', { name: /Spanish animals/ })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/sets/${setId}$`));

    // Duplicate, then delete the copy.
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Duplicate' }).click();
    await expect(page.getByRole('heading', { name: 'Spanish animals (copy)' })).toBeVisible();
    await page.goto('#/sets');
    await expect(page.getByTestId('set-card')).toHaveCount(2);
    await page.getByTestId('set-card').filter({ hasText: '(copy)' }).click();
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete set' }).click();
    await page.getByTestId('confirm-ok').click();
    await expect(page).toHaveURL(/#\/sets$/);
    await expect(page.getByTestId('set-card')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('set-card')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('export a set as JSON and CSV, and re-import the JSON', async ({ page }, testInfo) => {
    await createSetFromPdf(page, 'Cell Biology');
    await page.getByRole('button', { name: 'More actions' }).click();
    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export JSON' }).click(),
    ]);
    const jsonPath = testInfo.outputPath('set.json');
    await jsonDownload.saveAs(jsonPath);
    const exported = JSON.parse(readFileSync(jsonPath, 'utf8'));
    expect(exported.format).toBe('recall-study-sets');
    expect(exported.sets[0].cards).toHaveLength(11);

    await page.getByRole('button', { name: 'More actions' }).click();
    const [csvDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export CSV' }).click(),
    ]);
    const csvPath = testInfo.outputPath('set.csv');
    await csvDownload.saveAs(csvPath);
    const csv = readFileSync(csvPath, 'utf8');
    expect(csv.split('\r\n')[0]).toBe('﻿term,definition,example,source_page,starred,also_accept');
    expect(csv).toContain('Mitochondria,The organelle that releases energy from food through cellular respiration.,Muscle cells contain many mitochondria.,1,,');

    // Re-importing creates a separate copy instead of overwriting.
    await page.goto('#/sets');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON' }).click();
    await (await chooser).setFiles(jsonPath);
    await expect(page.getByText('Imported 1 study set')).toBeVisible();
    await expect(page.getByTestId('set-card')).toHaveCount(2);
  });

  test('deleting a set also deletes its progress and source PDF', async ({ page }) => {
    const setId = await createSetFromPdf(page);
    await page.goto(`#/study/flashcards?set=${setId}`);
    await expect(page.getByTestId('flashcard')).toBeVisible();
    await page.keyboard.press('2');
    await page.goto(`#/sets/${setId}`);
    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete set' }).click();
    await expect(page.getByRole('dialog')).toContainText('stored source PDF');
    await page.getByTestId('confirm-ok').click();
    await expect(page).toHaveURL(/#\/sets$/);
    await page.goto('#/upload');
    await expect(page.getByText('Recent imports')).toHaveCount(0);
    await page.goto('#/settings');
    await expect(page.getByText('No PDF files are stored.')).toBeVisible();
    await page.goto('#/progress');
    await expect(page.getByTestId('progress-stats')).toContainText('Cards studied0');
  });

  test('back up everything, clear all data, and restore it', async ({ page }, testInfo) => {
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    await page.goto(`#/study/flashcards?set=${setId}`);
    await expect(page.getByTestId('flashcard')).toBeVisible();
    for (const key of ['2', '1', '2', '2']) await page.keyboard.press(key);
    await expect(page.getByTestId('flashcards-summary')).toBeVisible();

    await page.goto('#/settings');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-all').click()]);
    const backupPath = testInfo.outputPath('backup.json');
    await download.saveAs(backupPath);
    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    expect(backup.format).toBe('recall-study-backup');
    expect(backup.progress).toHaveLength(4);
    expect(backup.sessions).toHaveLength(1);

    await page.getByTestId('clear-all').click();
    await expect(page.getByTestId('confirm-ok')).toBeDisabled();
    await page.locator('#confirm-text').fill('DELETE');
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText('All local data deleted')).toBeVisible();
    await page.reload();
    await page.goto('#/');
    await expect(page.getByText('Welcome to Recall')).toBeVisible();

    await page.goto('#/settings');
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('import-backup').click();
    await (await chooser).setFiles(backupPath);
    await page.getByTestId('import-merge').click();
    await expect(page.getByText('Imported 1 study set')).toBeVisible();
    await page.goto('#/progress');
    await expect(page.getByTestId('progress-stats')).toContainText('Cards studied4');
    await expect(page.getByTestId('progress-stats')).toContainText('Overall accuracy75%');
  });

  test('invalid import files show an error', async ({ page }, testInfo) => {
    const bad = testInfo.outputPath('bad.json');
    writeFileSync(bad, '{"not": "a backup"}');
    await page.goto('#/sets');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Import JSON' }).click();
    await (await chooser).setFiles(bad);
    await expect(page.getByText('No study sets were found in this file.')).toBeVisible();
  });

  test('theme preference persists and the app loads from the GitHub Pages subpath', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('#/settings');
    expect(new URL(page.url()).pathname).toBe('/Flashcards/');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    expect(errors).toEqual([]);
  });
});
