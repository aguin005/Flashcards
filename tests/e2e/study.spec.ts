import { expect, test } from '@playwright/test';
import { createManualSet, createSetFromPdf, SPANISH, watchErrors } from './helpers';

const termFor = (definition: string) => SPANISH.find(([, d]) => d === definition.trim())![0];

test.describe('Flashcards', () => {
  test('flip, navigate, mark, star, resume, and repeat difficult cards', async ({ page }) => {
    const errors = watchErrors(page);
    const setId = await createSetFromPdf(page);
    await page.getByTestId('mode-flashcards').click();

    const card = page.getByTestId('flashcard');
    const progress = page.getByTestId('flashcard-progress');
    await expect(progress).toHaveText('1 of 11');
    await expect(page.getByTestId('flashcard-front')).toHaveText('Photosynthesis');

    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('data-flipped', 'true');
    await card.click();
    await expect(card).toHaveAttribute('data-flipped', 'false');

    await page.getByRole('button', { name: 'Next card' }).click();
    await expect(progress).toHaveText('2 of 11');
    await page.keyboard.press('ArrowLeft');
    await expect(progress).toHaveText('1 of 11');

    await page.getByRole('button', { name: 'Know it' }).click();
    await page.getByRole('button', { name: 'Still learning' }).click();
    await page.keyboard.press('2');
    await expect(progress).toHaveText('4 of 11');
    await page.keyboard.press('s'); // star card 4
    // The star is shown only after it is saved, so wait for it before reloading.
    await expect(page.getByRole('button', { name: 'Unstar Mitochondria' })).toBeVisible();

    // Position is remembered between sessions.
    await page.reload();
    await expect(progress).toHaveText('4 of 11');
    await expect(page.getByText('Picked up where you left off')).toBeVisible();

    for (let i = 0; i < 8; i++) await page.keyboard.press('2');
    const summary = page.getByTestId('flashcards-summary');
    await expect(summary).toContainText('Round complete');
    await expect(summary).toContainText('1Still learning');
    await page.getByRole('button', { name: 'Study 1 still-learning card again' }).click();
    await expect(progress).toContainText('1 of 1');
    await expect(page.getByTestId('flashcard-front')).toHaveText('Osmosis');

    // Starred-only study.
    await page.goto(`#/study/flashcards?set=${setId}`);
    await page.getByRole('button', { name: 'Flashcard options' }).click();
    await page.getByRole('switch', { name: /Starred cards only/ }).click();
    await expect(progress).toHaveText('1 of 1');
    await expect(page.getByTestId('flashcard-front')).toHaveText('Mitochondria');

    // Definition first.
    await page.getByRole('radio', { name: 'Definition' }).click();
    await expect(page.getByTestId('flashcard-front')).toContainText('releases energy');
    expect(errors).toEqual([]);
  });
});

test.describe('Multiple-choice quiz', () => {
  test('one correct answer per question, feedback, score, and retry missed', async ({ page }) => {
    const errors = watchErrors(page);
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    await page.goto(`#/study/quiz?set=${setId}`);
    await page.getByRole('radio', { name: 'Choose the term' }).click();
    await page.getByRole('radio', { name: 'All 4' }).click();
    await page.getByTestId('start-quiz').click();

    for (let q = 0; q < 4; q++) {
      const prompt = await page.getByTestId('quiz-prompt').innerText();
      const correctTerm = termFor(prompt);
      const options = page.getByTestId('quiz-option');
      await expect(options).toHaveCount(4);
      const texts = await options.allInnerTexts();
      expect(new Set(texts.map((t) => t.replace(/^\d\s*/, ''))).size).toBe(4);
      // Miss the first two questions on purpose.
      if (q < 2) await options.filter({ hasNotText: correctTerm }).first().click();
      else await options.filter({ hasText: correctTerm }).click();
      await expect(page.locator('[data-testid=quiz-option][data-correct=true]')).toHaveCount(1);
      await expect(page.getByTestId('quiz-feedback')).toContainText(q < 2 ? 'Not quite.' : 'Correct!');
      await expect(page.getByTestId('quiz-feedback')).toContainText(`${correctTerm} means:`);
      await page.getByTestId('quiz-next').click();
    }

    await expect(page.getByTestId('score-percent')).toHaveText('50%');
    await expect(page.getByTestId('score')).toContainText('2 of 4 correct');
    await expect(page.getByTestId('missed-item')).toHaveCount(2);

    await page.getByRole('button', { name: 'Retry 2 missed questions' }).click();
    await expect(page.getByTestId('question-progress')).toHaveText('Retry · Question 1 of 2');
    for (let q = 0; q < 2; q++) {
      const correctTerm = termFor(await page.getByTestId('quiz-prompt').innerText());
      await page.getByTestId('quiz-option').filter({ hasText: correctTerm }).click();
      await page.keyboard.press('Enter');
    }
    await expect(page.getByTestId('score-percent')).toHaveText('100%');
    expect(errors).toEqual([]);
  });

  test('a two-card set gets two options instead of four', async ({ page }) => {
    const setId = await createManualSet(page, 'Tiny', SPANISH.slice(0, 2));
    await page.goto(`#/study/quiz?set=${setId}`);
    await expect(page.getByText('only 2 distinct answers')).toBeVisible();
    await page.getByTestId('start-quiz').click();
    await expect(page.getByTestId('quiz-option')).toHaveCount(2);
  });
});

test.describe('Written recall', () => {
  test('normalized grading, typo check, override, and results', async ({ page }) => {
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    await page.goto(`#/study/written?set=${setId}`);
    await page.getByRole('radio', { name: 'Type the term' }).click();
    await page.getByRole('radio', { name: 'All 4' }).click();
    await page.getByTestId('start-written').click();

    const prompt = () => page.getByTestId('written-question').locator('p').nth(1).innerText();
    const feedback = page.getByTestId('written-feedback');

    // 1. Exact answer with different case, spacing, and punctuation.
    await page.getByTestId('written-input').fill(`  ${termFor(await prompt()).toUpperCase()}!! `);
    await page.keyboard.press('Enter');
    await expect(feedback).toHaveAttribute('data-verdict', 'correct');
    await page.keyboard.press('Enter');

    // 2. A typo is flagged as close; the learner decides.
    const answer2 = termFor(await prompt());
    await page.getByTestId('written-input').fill(answer2.slice(0, -1) + 'x');
    await page.keyboard.press('Enter');
    await expect(feedback).toHaveAttribute('data-verdict', 'close');
    await expect(page.getByTestId('written-next')).toBeDisabled();
    await page.getByRole('button', { name: 'Yes, I was right' }).click();
    await page.getByTestId('written-next').click();

    // 3. Wrong answer reveals the correct one; override counts it as correct.
    const answer3 = termFor(await prompt());
    await page.getByTestId('written-input').fill('zzz');
    await page.keyboard.press('Enter');
    await expect(feedback).toHaveAttribute('data-verdict', 'incorrect');
    await expect(feedback).toContainText(answer3);
    await page.getByRole('button', { name: 'I was right, count it as correct' }).click();
    await page.getByTestId('written-next').click();

    // 4. "I don't know" counts as missed.
    await page.getByRole('button', { name: 'I don’t know' }).click();
    await page.getByTestId('written-next').click();

    await expect(page.getByTestId('score')).toContainText('3 of 4 correct');
    await expect(page.getByTestId('missed-item')).toHaveCount(1);
  });

  test('stored alternates are accepted', async ({ page }) => {
    const setId = await createManualSet(page, 'Biology', [
      ['Deoxyribonucleic acid', 'Molecule carrying genetic information'],
      ['Adenosine triphosphate', 'Energy currency of the cell'],
    ]);
    await page.goto(`#/sets/${setId}/edit`);
    await page.getByRole('button', { name: 'Example and options' }).first().click();
    await page.locator('input[id^="alt-"]').first().fill('DNA');
    await page.getByTestId('save-editor').click();
    await expect(page).toHaveURL(new RegExp(`#/sets/${setId}$`));
    await page.goto(`#/study/written?set=${setId}`);
    await page.getByRole('radio', { name: 'Type the term' }).click();
    await page.getByTestId('start-written').click();
    for (let i = 0; i < 2; i++) {
      const text = await page.getByTestId('written-question').locator('p').nth(1).innerText();
      await page.getByTestId('written-input').fill(text.includes('genetic') ? 'dna' : 'adenosine triphosphate');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('written-feedback')).toHaveAttribute('data-verdict', 'correct');
      await page.keyboard.press('Enter');
    }
    await expect(page.getByTestId('score-percent')).toHaveText('100%');
  });
});

test.describe('Matching', () => {
  test('complete a round with a mistake and see results', async ({ page }) => {
    const errors = watchErrors(page);
    const setId = await createManualSet(page, 'Spanish', SPANISH);
    await page.goto(`#/study/match?set=${setId}`);
    await page.getByTestId('start-match').click();
    await expect(page.getByTestId('match-term')).toHaveCount(4);

    const firstTerm = page.getByTestId('match-term').first();
    const id = (await firstTerm.getAttribute('data-card'))!;
    await firstTerm.click();
    await page.locator(`[data-testid=match-definition]:not([data-card="${id}"])`).first().click();
    await expect(page.getByText('1 mistake')).toBeVisible();
    await page.waitForTimeout(650);

    for (let i = 0; i < 4; i++) {
      const term = page.locator('[data-testid=match-term]:not([disabled])').first();
      const cardId = (await term.getAttribute('data-card'))!;
      await term.click();
      await page.locator(`[data-testid=match-definition][data-card="${cardId}"]`).click();
      await page.waitForTimeout(450);
    }
    await expect(page.getByTestId('match-done')).toContainText('All matched!');
    await expect(page.getByTestId('match-mistakes')).toHaveText('1');
    await expect(page.getByTestId('match-time')).toHaveText(/^\d:\d\d\.\d$/);
    expect(errors).toEqual([]);
  });
});

test.describe('Spaced repetition and progress', () => {
  test('answers update progress, cards come due later, and review clears them', async ({ page, context }) => {
    await context.clock.install({ time: new Date() });
    const setId = await createManualSet(page, 'Spanish', SPANISH);

    // Flashcards: know 3, miss 1.
    await page.goto(`#/study/flashcards?set=${setId}`);
    await expect(page.getByTestId('flashcard')).toBeVisible();
    for (const key of ['2', '2', '1', '2']) await page.keyboard.press(key);
    await expect(page.getByTestId('flashcards-summary')).toBeVisible();

    await page.goto(`#/sets/${setId}`);
    await expect(page.getByText('Developing').first()).toBeVisible();
    await expect(page.getByText('Learning', { exact: true }).first()).toBeVisible();

    await page.goto('#/review');
    await expect(page.getByTestId('due-card')).toHaveCount(0);

    // Ten minutes later the missed card is due; two days later all are.
    await page.clock.fastForward('00:11:00');
    await page.goto('#/');
    await page.goto('#/review');
    await expect(page.getByTestId('due-card')).toHaveCount(1);
    await page.clock.fastForward('48:00:00');
    await page.goto('#/');
    await expect(page.getByTestId('review-due-card')).toContainText('4');
    await page.goto('#/review');
    await expect(page.getByTestId('due-card')).toHaveCount(4);

    await page.getByTestId('review-flashcards').click();
    await expect(page.getByTestId('flashcard-progress')).toHaveText('1 of 4');
    for (let i = 0; i < 4; i++) await page.keyboard.press('2');
    await expect(page.getByTestId('flashcards-summary')).toBeVisible();
    await page.goto('#/review');
    await expect(page.getByText('All caught up')).toBeVisible();

    // Progress page reflects real activity.
    await page.goto('#/progress');
    const stats = page.getByTestId('progress-stats');
    await expect(stats).toContainText('Cards studied4');
    await expect(stats).toContainText('Overall accuracy88%'); // 7 of 8 answers correct
    await expect(page.getByTestId('sessions-table').locator('tbody tr')).toHaveCount(2);
    await expect(page.getByTestId('missed-table').locator('tbody tr')).toHaveCount(1);
  });
});
