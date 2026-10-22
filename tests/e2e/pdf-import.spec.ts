import { expect, test } from '@playwright/test';
import { fixture, importPdf, watchErrors } from './helpers';

test.describe('PDF upload and vocabulary extraction', () => {
  test('extracts, edits, and saves vocabulary; the set survives a reload', async ({ page }) => {
    const errors = watchErrors(page);
    await importPdf(page);

    const stats = page.getByTestId('extraction-stats');
    await expect(stats).toContainText('13 entries found');
    await expect(stats).toContainText('11 selected');
    await expect(stats).toContainText('6 header/footer lines removed');
    await expect(page.getByTestId('entry-row')).toHaveCount(13);

    // Uncertain entries are flagged and left unselected, never filled with invented text.
    const vacuole = page.getByTestId('entry-row').last();
    await expect(page.getByTestId('entry-term').last()).toHaveValue('vacuole');
    await expect(page.getByTestId('entry-definition').last()).toHaveValue('');
    await expect(vacuole.getByText('No definition')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Import vacuole' })).not.toBeChecked();

    // Edit a term and a definition.
    await page.getByTestId('entry-term').nth(4).fill('Ribosomes');
    await page.getByTestId('entry-definition').nth(4).fill('Organelles that build proteins.');

    // Delete an entry.
    await page.getByRole('button', { name: 'Delete Enzyme' }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(12);

    // Add a manual entry.
    await page.getByRole('button', { name: 'Add entry' }).click();
    await page.getByTestId('entry-term').first().fill('Cell wall');
    await page.getByTestId('entry-definition').first().fill('A rigid layer outside the plant cell membrane.');

    // Search and filter.
    await page.getByLabel('Search extracted entries').fill('gene');
    await expect(page.getByTestId('entry-row')).toHaveCount(2); // Allele, Genotype ("genetic")
    await page.getByLabel('Search extracted entries').fill('');
    await page.getByRole('radio', { name: /Needs review/ }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(3);
    await page.getByRole('radio', { name: /^All/ }).click();

    // Duplicate removal: add a second "Osmosis" then remove duplicates.
    await page.getByRole('button', { name: 'Add entry' }).click();
    await page.getByTestId('entry-term').first().fill('osmosis');
    await page.getByTestId('entry-definition').first().fill('Water moving.');
    await page.getByRole('button', { name: 'Remove duplicates' }).click();
    await page.getByTestId('confirm-ok').click();
    await expect(page.getByText('Removed 1 duplicate')).toBeVisible();

    // Selecting an entry without a definition blocks saving with a clear message.
    await page.getByRole('checkbox', { name: 'Import vacuole' }).check();
    await page.getByTestId('save-set').click();
    await expect(page.getByRole('alert').filter({ hasText: 'missing a term or definition' })).toBeVisible();
    await page.getByRole('radio', { name: /^All/ }).click();
    await page.getByRole('checkbox', { name: 'Import vacuole' }).uncheck();

    await page.locator('#set-title').fill('Unit 3 Biology');
    await page.locator('#set-subject').fill('BIO 101');
    await page.getByTestId('save-set').click();
    await expect(page).toHaveURL(/#\/sets\/s_/);
    await expect(page.getByRole('heading', { name: 'Unit 3 Biology' })).toBeVisible();
    await expect(page.getByTestId('card-row')).toHaveCount(11);
    await expect(page.getByText('Organelles that build proteins.')).toBeVisible();
    await expect(page.getByText('Page 2').first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Unit 3 Biology' })).toBeVisible();
    await expect(page.getByTestId('card-row')).toHaveCount(11);
    await page.goto('#/sets');
    await expect(page.getByTestId('set-card')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('the review draft is kept across a reload', async ({ page }) => {
    await importPdf(page);
    await page.getByTestId('entry-definition').first().fill('Edited before reload.');
    await page.waitForTimeout(800); // autosave debounce
    await page.reload();
    await expect(page.getByTestId('entry-definition').first()).toHaveValue('Edited before reload.');
    await page.goto('#/upload');
    await expect(page.getByText('Not saved yet')).toBeVisible();
  });

  const errorCases: [string, string, RegExp][] = [
    ['corrupted.pdf', 'corrupted', /looks damaged/],
    ['not-really-a.pdf', 'not-pdf', /not a PDF/],
    ['empty.pdf', 'empty-file', /empty/],
    ['scanned-image-only.pdf', 'no-text', /No selectable text/],
  ];
  for (const [file, code, message] of errorCases) {
    test(`reports a helpful error for ${file}`, async ({ page }) => {
      await page.goto('#/upload');
      await page.getByTestId('file-input').setInputFiles(fixture(file));
      const card = page.getByTestId('upload-error');
      await expect(card).toHaveAttribute('data-code', code);
      await expect(card).toContainText(message);
      await card.getByRole('button', { name: 'Choose another file' }).click();
      await expect(page.getByTestId('dropzone')).toBeVisible();
    });
  }

  test('unlocks a password-protected PDF', async ({ page }) => {
    await page.goto('#/upload');
    await page.getByTestId('file-input').setInputFiles(fixture('password-protected.pdf'));
    await expect(page.getByTestId('upload-error')).toHaveAttribute('data-code', 'password-required');
    await page.getByLabel('PDF password').fill('wrong');
    await page.getByRole('button', { name: 'Unlock PDF' }).click();
    await expect(page.getByTestId('upload-error')).toHaveAttribute('data-code', 'password-incorrect');
    await page.getByLabel('PDF password').fill('study123');
    await page.getByRole('button', { name: 'Unlock PDF' }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(13);
  });

  test('optional OCR reads a scanned page with the self-hosted engine', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await page.goto('#/upload');
    await page.getByTestId('file-input').setInputFiles(fixture('scanned-text.pdf'));
    await expect(page.getByTestId('upload-error')).toHaveAttribute('data-code', 'no-text');
    await page.getByRole('button', { name: 'Try OCR' }).click();
    await expect(page.getByTestId('entry-row')).toHaveCount(3, { timeout: 90_000 });
    const terms = await page.getByTestId('entry-term').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
    expect(terms).toEqual(['Atom', 'Molecule', 'Isotope']);
    await expect(page.getByTestId('entry-definition').first()).toHaveValue('The smallest unit of a chemical element.');
    await expect(page.getByText('OCR').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a text PDF with no vocabulary patterns explains what to do', async ({ page }) => {
    await page.goto('#/upload');
    await page.getByTestId('file-input').setInputFiles(fixture('no-vocabulary.pdf'));
    await expect(page.getByText('No vocabulary was detected')).toBeVisible();
    await page.getByRole('button', { name: 'Show' }).click();
    await expect(page.getByText('Meeting reminder for Thursday afternoon')).toBeVisible();
  });
});
