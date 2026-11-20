import { expect, test } from '@playwright/test';
import { createManualSet, importPdf, SPANISH, watchErrors } from './helpers';

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
    expect(errors).toEqual([]);
  });

  test('flashcards: tap to flip, swipe right for know it, swipe left for still learning', async ({ page }) => {
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    await page.goto(`#/study/flashcards?set=${setId}`);
    const card = page.getByTestId('flashcard');
    const progress = page.getByTestId('flashcard-progress');
    await expect(progress).toHaveText('1 of 4');
    await expect(page.getByText('Swipe right if you know it')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keyboard shortcuts' })).toBeHidden();

    await card.tap();
    await expect(card).toHaveAttribute('data-flipped', 'true');

    const box = (await page.getByTestId('flashcard-swipe').boundingBox())!;
    const swipe = async (dx: number, dy = 0) => {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) await page.mouse.move(x + (dx * i) / 12, y + (dy * i) / 12);
      await page.mouse.up();
    };

    await swipe(40); // too short: snaps back, nothing is marked, the card does not flip
    await expect(progress).toHaveText('1 of 4');
    await expect(card).toHaveAttribute('data-flipped', 'true');

    await swipe(180);
    await expect(progress).toHaveText('2 of 4');
    await swipe(-180);
    await expect(progress).toHaveText('3 of 4');
    await expect(page.getByText('1 learning')).toBeVisible();
    await expect(page.getByText('1 known')).toBeVisible();

    await swipe(0, 150); // vertical drags scroll the page instead
    await expect(progress).toHaveText('3 of 4');
  });

  test('text fields are at least 16px so phones do not zoom in, and the review page has a sticky save bar', async ({ page }) => {
    const smallFields = async () =>
      page.evaluate(() =>
        [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]), textarea, select')]
          .filter((el) => (el as HTMLElement).offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16)
          .map((el) => el.id || el.getAttribute('aria-label') || el.tagName),
      );

    await page.goto('#/upload?mode=paste');
    await expect(page.getByTestId('paste-input')).toBeVisible();
    expect(await smallFields()).toEqual([]);

    await importPdf(page);
    expect(await smallFields()).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 1500));
    const sticky = page.getByTestId('save-set-sticky');
    await expect(sticky).toBeVisible();
    await sticky.tap();
    await expect(page).toHaveURL(/#\/sets\/s_/);

    // Toasts sit at the top on phones, clear of the bottom navigation and study buttons.
    const toast = page.getByText('Saved 11 cards');
    await expect(toast).toBeVisible();
    const box = (await toast.boundingBox())!;
    expect(box.y).toBeLessThan(200);
  });

  test('the app is installable: manifest and icons load from the subpath', async ({ page, request }) => {
    await page.goto('#/settings');
    await expect(page.getByRole('heading', { name: 'Install on your phone' })).toBeVisible();
    const href = await page.locator('link[rel=manifest]').getAttribute('href');
    expect(href).toBe('/Flashcards/manifest.webmanifest');
    const manifest = await (await request.get(href!)).json();
    expect(manifest.display).toBe('standalone');
    for (const icon of manifest.icons) {
      const res = await request.get(new URL(icon.src, `http://localhost:4173${href}`).toString());
      expect(res.status(), icon.src).toBe(200);
    }
    const apple = await page.locator('link[rel=apple-touch-icon]').getAttribute('href');
    expect((await request.get(apple!)).status()).toBe(200);
  });
});
