import { expect, test } from '@playwright/test';
import { createManualSet, SPANISH, watchErrors } from './helpers';

test.describe('Mobile layout', () => {
  test('bottom navigation works and pages do not scroll sideways', async ({ page }) => {
    const errors = watchErrors(page);
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    const nav = page.getByRole('navigation', { name: 'Main' }).last();
    for (const [label, heading] of [
      ['Sets', 'My Study Sets'],
      ['Upload', 'Upload PDF'],
      ['Review', 'Review Due'],
      ['Progress', 'Progress'],
    ]) {
      await nav.getByRole('link', { name: label }).click();
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${heading} overflows horizontally`).toBeLessThanOrEqual(0);
    }

    for (const mode of ['flashcards', 'quiz', 'written', 'match']) {
      await page.goto(`#/study/${mode}?set=${setId}`);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${mode} overflows horizontally`).toBeLessThanOrEqual(0);
    }

    await page.goto(`#/study/flashcards?set=${setId}`);
    await page.getByTestId('flashcard').tap();
    await expect(page.getByTestId('flashcard')).toHaveAttribute('data-flipped', 'true');
    await page.getByRole('button', { name: 'Know it' }).tap();
    await expect(page.getByTestId('flashcard-progress')).toHaveText('2 of 4');
    expect(errors).toEqual([]);
  });
});
