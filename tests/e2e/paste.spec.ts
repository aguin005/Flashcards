import { expect, test } from '@playwright/test';
import { watchErrors } from './helpers';

test.describe('Paste text import', () => {
  test('paste notes, review, save, and copy the terms back out', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = watchErrors(page);
    await page.goto('#/upload');
    await page.getByRole('radio', { name: /Paste text/ }).click();
    await expect(page).toHaveURL(/mode=paste/);

    await page.getByTestId('paste-input').fill(
      'Osmosis: diffusion of water across a membrane.\n• Enzyme - a protein that speeds up reactions\nATP\tenergy currency of the cell',
    );
    await expect(page.getByTestId('paste-preview')).toContainText('3 terms detected');

    // The draft survives a reload (phones often reload a tab after switching apps).
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.getByTestId('paste-input')).toHaveValue(/Osmosis/);

    // "Paste from clipboard" appends.
    await page.evaluate(() => navigator.clipboard.writeText('Ribosome: site of protein synthesis'));
    await page.getByRole('button', { name: 'Paste from clipboard' }).click();
    await expect(page.getByTestId('paste-preview')).toContainText('4 terms detected');

    await page.getByTestId('paste-continue').click();
    await expect(page).toHaveURL(/#\/upload\/imp_/);
    await expect(page.getByTestId('entry-row')).toHaveCount(4);
    await expect(page.locator('#set-title')).toHaveValue('Pasted terms');
    await page.locator('#set-title').fill('Biology terms');
    await page.getByTestId('save-set').click();
    await expect(page).toHaveURL(/#\/sets\/s_/);
    await expect(page.getByTestId('card-row')).toHaveCount(4);
    await expect(page.getByText('From pasted text', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Copy terms' }).click();
    await expect(page.getByText('Copied 4 cards')).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split('\n')).toEqual([
      'Osmosis\tdiffusion of water across a membrane.',
      'Enzyme\ta protein that speeds up reactions',
      'ATP\tenergy currency of the cell',
      'Ribosome\tsite of protein synthesis',
    ]);
    expect(errors).toEqual([]);
  });

  test('explicit formats: tab, CSV file, custom separator, and blocks', async ({ page }) => {
    await page.goto('#/upload?mode=paste');
    const input = page.getByTestId('paste-input');
    const format = page.getByTestId('paste-format');
    const preview = page.getByTestId('paste-preview');

    await input.fill('Term\tDefinition\nperro\tdog\tEl perro ladra.\ngato\tcat');
    await format.selectOption('tab');
    await expect(preview).toContainText('2 terms detected');

    await input.fill('E = mc^2 = energy\nF = ma');
    await format.selectOption('custom');
    await page.getByLabel('Separator').fill(' = ');
    await expect(preview).toContainText('2 terms detected');
    await expect(preview).toContainText('mc^2 = energy');

    await input.fill('Photosynthesis\nHow plants make food.\n\nRespiration\nHow cells release energy.');
    await format.selectOption('blocks');
    await expect(preview).toContainText('2 terms detected');

    // A CSV file chosen in the PDF tab opens in the paste tab with the CSV format selected.
    await page.getByRole('radio', { name: /Upload PDF/ }).click();
    await page.getByTestId('file-input').setInputFiles({
      name: 'spanish.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('term,definition\nperro,dog\n"gato","cat, the animal"\n'),
    });
    await expect(format).toHaveValue('comma');
    await expect(page.getByText('spanish.csv')).toBeVisible();
    await expect(preview).toContainText('cat, the animal');
    await page.getByTestId('paste-continue').click();
    await expect(page.locator('#set-title')).toHaveValue('spanish');
    await expect(page.getByTestId('entry-row')).toHaveCount(2);
  });

  test('Ctrl+V outside a text box pastes into the paste tab', async ({ page }) => {
    await page.goto('#/upload');
    await expect(page.getByTestId('dropzone')).toBeVisible();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData('text/plain', 'Lysosome\tdigests waste');
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    });
    await expect(page).toHaveURL(/mode=paste/);
    await expect(page.getByTestId('paste-input')).toHaveValue('Lysosome\tdigests waste');
  });
});
