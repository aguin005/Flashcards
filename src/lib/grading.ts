import { normalizeText } from './utils';

/**
 * Local, rule-based grading for written answers. No AI service is involved.
 *
 * - "correct": the normalized answer exactly matches the expected answer,
 *   one of its explicitly stored alternates, or one of its listed variants
 *   (text without parentheses, items separated by ";" or "/").
 * - "close": a likely typo in a term, or a definition that shares many key
 *   words with the expected one. The learner decides with one click.
 * - "incorrect": everything else. The learner can still override.
 */

export type Verdict = 'correct' | 'close' | 'incorrect';

export interface GradeResult {
  verdict: Verdict;
  /** 0-1 similarity used for "close" decisions. */
  similarity: number;
}

const ARTICLES = /^(?:a|an|the|to)\s+/;

const STOPWORDS = new Set(
  'a an the of to in on for and or but is are was were be been being by with as at from that which who whom this these those it its their there into than then so such can may might will would should could do does did has have had not no also each any all some more most other'.split(
    ' ',
  ),
);

export function normalizeAnswer(s: string): string {
  return normalizeText(s).replace(ARTICLES, '').trim();
}

/**
 * Answer variants listed in the stored text itself: the text without
 * parentheses, and items separated by ";" (plus "/" and "or" for terms).
 */
export function answerVariants(expected: string, kind: 'term' | 'definition'): string[] {
  const variants = new Set<string>([expected]);
  const noParens = expected.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').trim();
  if (noParens) variants.add(noParens);
  const splitter = kind === 'term' ? /\s*[;/]\s*|\s+or\s+/i : /\s*;\s*/;
  for (const base of [expected, noParens]) {
    for (const part of base.split(splitter)) {
      if (part.trim()) variants.add(part.trim());
    }
  }
  return [...variants];
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function keywords(s: string): string[] {
  return normalizeText(s)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(stem);
}

/** F1 overlap of key words (order-insensitive). */
export function keywordSimilarity(input: string, expected: string): number {
  const a = keywords(input);
  const b = keywords(expected);
  if (!a.length || !b.length) return 0;
  const bCounts = new Map<string, number>();
  for (const w of b) bCounts.set(w, (bCounts.get(w) ?? 0) + 1);
  let overlap = 0;
  for (const w of a) {
    const n = bCounts.get(w) ?? 0;
    if (n > 0) {
      overlap++;
      bCounts.set(w, n - 1);
    }
  }
  const precision = overlap / a.length;
  const recall = overlap / b.length;
  return precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
}

export function gradeAnswer(
  input: string,
  expected: string,
  opts: { alternates?: string[]; kind: 'term' | 'definition' },
): GradeResult {
  const given = normalizeAnswer(input);
  if (!given) return { verdict: 'incorrect', similarity: 0 };

  const candidates = [expected, ...(opts.alternates ?? [])]
    .flatMap((text) => answerVariants(text, opts.kind))
    .map(normalizeAnswer)
    .filter(Boolean);

  if (candidates.includes(given)) return { verdict: 'correct', similarity: 1 };

  if (opts.kind === 'term') {
    let best = 0;
    for (const c of candidates) {
      const dist = levenshtein(given, c);
      const allowed = c.length >= 9 ? 2 : c.length >= 4 ? 1 : 0;
      const sim = 1 - dist / Math.max(given.length, c.length);
      best = Math.max(best, sim);
      if (dist <= allowed) return { verdict: 'close', similarity: sim };
    }
    return { verdict: 'incorrect', similarity: best };
  }

  let best = 0;
  for (const c of candidates) best = Math.max(best, keywordSimilarity(given, c));
  if (best >= 0.85) return { verdict: 'correct', similarity: best };
  if (best >= 0.4) return { verdict: 'close', similarity: best };
  return { verdict: 'incorrect', similarity: best };
}
