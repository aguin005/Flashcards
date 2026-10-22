import { describe, expect, it } from 'vitest';
import { applyReview, DAY, isDue, masteryOf, MINUTE } from '../../src/lib/spaced-repetition';

const ids = { cardId: 'c1', setId: 's1' };

describe('spaced repetition', () => {
  it('starts cards as new and not due', () => {
    expect(masteryOf(undefined)).toBe('new');
    expect(isDue(undefined)).toBe(false);
  });

  it('a first correct answer moves to developing with a 1 day interval', () => {
    const now = 1_000_000;
    const p = applyReview(undefined, ids, true, now);
    expect(p.box).toBe(2);
    expect(masteryOf(p)).toBe('developing');
    expect(p.nextReviewAt).toBe(now + DAY);
    expect(p.reviews).toBe(1);
    expect(p.correct).toBe(1);
  });

  it('a wrong answer drops to learning and comes back within minutes', () => {
    const now = 1_000_000;
    const p = applyReview(undefined, ids, false, now);
    expect(masteryOf(p)).toBe('learning');
    expect(p.nextReviewAt).toBe(now + 10 * MINUTE);
    expect(isDue(p, now + 11 * MINUTE)).toBe(true);
  });

  it('never marks a card mastered after repeated correct answers in one sitting', () => {
    let now = 1_000_000;
    let p = applyReview(undefined, ids, true, now);
    for (let i = 0; i < 20; i++) {
      now += MINUTE;
      p = applyReview(p, ids, true, now);
    }
    expect(masteryOf(p)).toBe('developing');
    expect(p.correct).toBe(21);
  });

  it('reaches mastered only after correct answers on separate due dates', () => {
    let now = 1_000_000;
    let p = applyReview(undefined, ids, true, now); // box 2
    now = p.nextReviewAt!;
    p = applyReview(p, ids, true, now); // box 3
    expect(masteryOf(p)).toBe('familiar');
    now = p.nextReviewAt!;
    p = applyReview(p, ids, true, now); // box 4
    expect(masteryOf(p)).toBe('familiar');
    now = p.nextReviewAt!;
    p = applyReview(p, ids, true, now); // box 5
    expect(masteryOf(p)).toBe('mastered');
    expect(p.nextReviewAt! - now).toBe(16 * DAY);
  });

  it('increases intervals on correct answers and shortens them on misses', () => {
    let now = 0;
    let p = applyReview(undefined, ids, true, now);
    const first = p.nextReviewAt! - now;
    now = p.nextReviewAt!;
    p = applyReview(p, ids, true, now);
    const second = p.nextReviewAt! - now;
    expect(second).toBeGreaterThan(first);
    now = p.nextReviewAt!;
    p = applyReview(p, ids, false, now);
    expect(p.nextReviewAt! - now).toBeLessThan(first);
    expect(p.box).toBe(1);
    expect(p.streak).toBe(0);
  });
});
