import type {
  Confidence,
  EntryFlag,
  ExtractedEntry,
  ExtractionMethod,
  ExtractionStats,
  PageText,
  ParsedPage,
  TextLine,
} from '../types';
import { normalizeText, uid } from './utils';

/**
 * Rule-based vocabulary detection. Every definition comes from text in the
 * document; nothing is generated. When a pair is uncertain it is flagged for
 * review, and when no definition can be found the entry is kept with an empty
 * definition and a "no definition" flag instead of guessing one.
 *
 * Recognized formats:
 *  - "Term: definition", "Term - definition", "Term – definition", "Term — definition", "Term = definition"
 *  - Bulleted or numbered versions of the above
 *  - Dictionary style: "abate (v.) to lessen"
 *  - Two-column tables (term column, definition column), including wrapped cells
 *  - Glossary sections: a term on its own line followed by its definition
 *  - Indented definitions under a term line
 *  - "Term:" on its own line followed by the definition
 *  - "Key terms: a, b, c" lists (terms only; flagged as missing definitions)
 *  - Prose patterns: "X is defined as Y", "X refers to Y", "Y is called X", and (low confidence) "X is a Y"
 * Example lines ("Example:", "e.g.", "For example,") attach to the previous entry.
 */

export interface ExtractionResult {
  entries: ExtractedEntry[];
  pages: PageText[];
  stats: ExtractionStats;
}

// ---------- Word lists ----------

const LABEL_WORDS = new Set(
  [
    'note', 'notes', 'example', 'examples', 'eg', 'e g', 'ex', 'figure', 'fig', 'table', 'chapter', 'section', 'unit',
    'lesson', 'page', 'source', 'sources', 'date', 'name', 'class', 'period', 'answer', 'answers', 'question',
    'questions', 'objective', 'objectives', 'learning objectives', 'summary', 'review', 'homework', 'due', 'instructor',
    'professor', 'teacher', 'course', 'email', 'e mail', 'phone', 'tel', 'url', 'website', 'reading', 'readings',
    'remember', 'important', 'hint', 'tip', 'tips', 'warning', 'caution', 'definition', 'title', 'author', 'topic',
    'subject', 'goal', 'goals', 'purpose', 'overview', 'introduction', 'conclusion', 'materials', 'time', 'location',
    'room', 'office hours', 'grade', 'points', 'total', 'score', 'step', 'steps', 'result', 'results', 'method',
    'methods', 'discussion', 'abstract', 'background', 'solution', 'answer key', 'see also', 'reference', 'references',
    'citation', 'nb', 'ps', 'q', 'a', 'instructions', 'directions', 'agenda', 'outline', 'contents', 'table of contents',
    'key', 'legend', 'warning', 'quote', 'translation', 'tags', 'status', 'version', 'updated', 'created', 'term',
  ].map(normalizeText),
);

const TERM_LIST_LABELS = new Set(
  [
    'key terms', 'terms', 'vocabulary', 'key vocabulary', 'keywords', 'key words', 'key concepts', 'vocabulary words',
    'terms to know', 'important terms', 'word list', 'words', 'vocab', 'concepts', 'terms and concepts',
  ].map(normalizeText),
);

const GLOSSARY_HEADING =
  /^(?:glossary|key terms|key vocabulary|vocabulary(?: list| words)?|terms(?: to know| and definitions)?|definitions|key concepts|important terms|word list|terminology|vocab)\s*:?$/i;

const SECTION_END_HEADING = /^(?:chapter|unit|section|part|index|references|bibliography|works cited|appendix|answer key)\b/i;

const PRONOUN_STARTS = new Set(
  'this that these those it its there here he she they we you i one each some many most all our my your his her their what which who whom when where why how if as because although though while so but and or then also however thus therefore such both either neither any every no not'.split(
    ' ',
  ),
);

const ENDING_STOPWORDS = new Set(
  'the a an of to and or in on for with by at from as is are was were be that which who than but its their his her'.split(' '),
);

const HEADER_ROW_LEFT = new Set(['term', 'terms', 'word', 'words', 'vocabulary', 'concept', 'concepts', 'key term', 'name']);
const HEADER_ROW_RIGHT = /^(?:definition|definitions|meaning|meanings|description|explanation)\b/;

const BULLET_RE = /^\s*(?:[•*·‣⁃▪◦○●■□►▸➢➤✓✔-]|[–—](?=\s)|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)](?=\s)|[ivxIVX]{1,4}[.)])\s+/;

const EXAMPLE_RE =
  /^(?:e\.\s?g\.|eg\.|ex\.|ex:|examples?|for example|for instance|sample sentence|example sentence|usage)\s*[:.,\-–—]?\s+(.+)$/i;

const POS_RE =
  /^([\p{L}][\p{L}'’-]*(?:\s+[\p{L}'’-]+){0,3})\s+\((?:n|v|adj|adv|prep|conj|pron|interj|vt|vi|noun|verb|adjective|adverb|pl)\.?\)\s*[:\-–—]?\s*(.+)$/iu;

// ---------- Helpers ----------

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

function stripBullet(text: string): { text: string; bulleted: boolean } {
  const m = text.match(BULLET_RE);
  if (!m) return { text, bulleted: false };
  return { text: text.slice(m[0].length), bulleted: true };
}

export function cleanTerm(raw: string): string {
  return raw
    .replace(/^[\s"'“”‘’*_•·]+|[\s"'“”‘’*_]+$/g, '')
    .replace(/[\s:;,.–—-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanDefinition(raw: string): string {
  return raw
    .replace(/^[\s:;,=–—-]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isPlausibleTerm(raw: string, maxWords = 8): boolean {
  const t = cleanTerm(raw);
  if (t.length < 2 || t.length > 80) return false;
  if (!/\p{L}/u.test(t)) return false;
  const w = words(t);
  if (w.length > maxWords) return false;
  // A sentence inside the "term" means we split prose, not a term.
  if (/\p{Ll}{2,}[.!?]\s+\S/u.test(t)) return false;
  if (/[!?]$/.test(raw.trim())) return false;
  const norm = normalizeText(t);
  if (LABEL_WORDS.has(norm)) return false;
  if (/^(?:figure|fig|table|chapter|section|unit|lesson|page|step|part|question|exercise|problem|week|day|module)\s*[\dIVXivx.]+/i.test(t)) {
    return false;
  }
  if (/^https?:|www\.|@/i.test(t)) return false;
  if (/^[\d\s.,:/-]+$/.test(t)) return false;
  const first = w[0].toLowerCase().replace(/[^a-z]/g, '');
  if (PRONOUN_STARTS.has(first)) return false;
  const last = w[w.length - 1].toLowerCase().replace(/[^a-z]/g, '');
  if (w.length > 1 && ENDING_STOPWORDS.has(last)) return false;
  return true;
}

function endsSentence(s: string): boolean {
  return /[.!?:;)"”]\s*$/.test(s.trim());
}

function startsLowercase(s: string): boolean {
  return /^\p{Ll}/u.test(s.trim());
}

/** Join wrapped lines, removing end-of-line hyphenation ("photo-" + "synthesis"). */
export function joinLines(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) out = part;
    else if (/\p{L}-$/u.test(out) && /^\p{Ll}/u.test(part)) out = out.slice(0, -1) + part;
    else out += ' ' + part;
  }
  return out;
}

interface DelimitedMatch {
  term: string;
  definition: string;
  kind: 'colon' | 'dash' | 'equals' | 'pos';
}

const DELIMITERS: { re: RegExp; kind: DelimitedMatch['kind'] }[] = [
  { re: /^(.{1,90}?)\s*:(?:\s+(.*))?$/, kind: 'colon' },
  { re: /^(.{1,90}?)\s+(?:-{1,2}|–|—)\s+(.+)$/, kind: 'dash' },
  { re: /^(.{1,90}?\S)\s*—\s*(\S.*)$/, kind: 'dash' },
  { re: /^(.{1,90}?)\s+(?:=|->|→|=>|⇒)\s+(.+)$/, kind: 'equals' },
];

/**
 * Find the earliest term/definition delimiter on a line whose left side looks
 * like a term (or a "Key terms:" style label).
 */
export function parseDelimited(text: string): DelimitedMatch | null {
  const pos = text.match(POS_RE);
  if (pos && isPlausibleTerm(pos[1])) return { term: pos[1], definition: pos[2], kind: 'pos' };
  const matches: DelimitedMatch[] = [];
  for (const { re, kind } of DELIMITERS) {
    const m = text.match(re);
    if (m) matches.push({ term: m[1], definition: m[2] ?? '', kind });
  }
  matches.sort((a, b) => a.term.length - b.term.length);
  return (
    matches.find((m) => isPlausibleTerm(m.term) || TERM_LIST_LABELS.has(normalizeText(cleanTerm(m.term)))) ?? null
  );
}

function splitTermList(s: string): string[] {
  return s
    .split(/\s*[,;•]\s*|\s+and\s+/)
    .map(cleanTerm)
    .filter((t) => t && isPlausibleTerm(t, 6));
}

// ---------- Header/footer cleanup ----------

const PAGE_NUMBER_RE = /^(?:page\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?$/i;

function signature(text: string): string {
  return normalizeText(text).replace(/\d+/g, '#');
}

/** Lines in the top or bottom 10% of the page, where running headers, footers, and page numbers live. */
function marginCandidates(page: ParsedPage): Set<TextLine> {
  const set = new Set<TextLine>();
  if (page.height <= 0) return set;
  for (const l of page.lines) {
    if (l.y > page.height * 0.9 || l.y < page.height * 0.1) set.add(l);
  }
  return set;
}

export function removeHeadersAndFooters(pages: ParsedPage[]): { pages: ParsedPage[]; removed: number } {
  const candidates = pages.map(marginCandidates);
  // Without page geometry (pasted text) there are no margins to clean.
  const counts = new Map<string, number>();
  for (const cand of candidates) {
    const seen = new Set<string>();
    for (const l of cand) {
      const sig = signature(l.text);
      if (sig && !seen.has(sig)) {
        seen.add(sig);
        counts.set(sig, (counts.get(sig) ?? 0) + 1);
      }
    }
  }
  const repeatThreshold = Math.max(2, Math.ceil(pages.length * 0.4));
  let removed = 0;
  const cleaned = pages.map((page, i) => {
    const cand = candidates[i];
    const lines = page.lines.filter((l) => {
      if (!cand.has(l)) return true;
      const plain = l.text.replace(/^[-–—\s]+|[-–—\s]+$/g, '');
      const isPageNumber = PAGE_NUMBER_RE.test(plain);
      const isRepeated = pages.length >= 3 && (counts.get(signature(l.text)) ?? 0) >= repeatThreshold;
      if (isPageNumber || isRepeated) {
        removed++;
        return false;
      }
      return true;
    });
    return { ...page, lines };
  });
  return { pages: cleaned, removed };
}

// ---------- Main extraction ----------

interface Draft {
  term: string;
  defParts: string[];
  exampleParts: string[];
  page: number;
  method: ExtractionMethod;
  confidence: Confidence;
  flags: Set<EntryFlag>;
  startX: number;
  defX: number | null;
  mode: 'definition' | 'example';
  last: TextLine;
}

interface ProseBuffer {
  parts: string[];
  page: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function extractVocabulary(rawPages: ParsedPage[], opts: { ocr?: boolean } = {}): ExtractionResult {
  const { pages, removed } = removeHeadersAndFooters(rawPages);
  const lines = pages.flatMap((p) => p.lines);

  // Typical vertical distance between consecutive lines, used to spot paragraph breaks.
  const spacings: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1];
    const b = lines[i];
    const dy = a.y - b.y;
    if (a.page === b.page && dy > 0 && dy < Math.max(a.fontSize, 8) * 3) spacings.push(dy);
  }
  const lineSpacing = median(spacings) || 14;

  // Rightmost text edge per page, used to tell wrapped lines from lines that simply ended.
  // A wrapped line reaches (almost) the right edge of the text block, and that edge must be
  // well across the page; on pages of short list lines nothing counts as wrapped.
  const rightEdge = new Map<number, number>();
  for (const l of lines) rightEdge.set(l.page, Math.max(rightEdge.get(l.page) ?? 0, l.endX));
  const pageWidth = new Map(pages.map((p) => [p.page, p.width]));
  const wrapped = (l: TextLine | undefined): boolean => {
    if (!l || l.endX <= 0) return false;
    const width = pageWidth.get(l.page) ?? 0;
    const nearEdge = l.endX >= (rightEdge.get(l.page) ?? 0) - Math.max(l.fontSize, 8) * 4;
    return nearEdge && (width <= 0 || l.endX >= width * 0.55);
  };

  // Most common left edge per page; layout-based pairing only trusts lines starting there.
  const leftMargin = new Map<number, number>();
  for (const p of pages) {
    const counts = new Map<number, number>();
    for (const l of p.lines) {
      const k = Math.round(l.x / 4) * 4;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    let best = 0;
    let bestCount = -1;
    for (const [k, n] of counts) if (n > bestCount || (n === bestCount && k < best)) [best, bestCount] = [k, n];
    leftMargin.set(p.page, best);
  }

  const drafts: Draft[] = [];
  const prose: ProseBuffer[] = [];
  let draft: Draft | null = null;
  let proseBuf: ProseBuffer | null = null;
  let glossaryMode = false;

  const isNormalGap = (prev: TextLine, next: TextLine): boolean => {
    if (prev.page !== next.page) return true;
    const dy = prev.y - next.y;
    return dy > 0 && dy <= lineSpacing * 1.7;
  };

  const closeDraft = () => {
    if (draft) drafts.push(draft);
    draft = null;
  };
  const flushProse = () => {
    if (proseBuf && proseBuf.parts.length) prose.push(proseBuf);
    proseBuf = null;
  };

  const startDraft = (
    line: TextLine,
    term: string,
    definition: string,
    method: ExtractionMethod,
    confidence: Confidence,
    flags: EntryFlag[] = [],
    defX: number | null = null,
  ) => {
    closeDraft();
    flushProse();
    draft = {
      term: cleanTerm(term),
      defParts: definition.trim() ? [definition] : [],
      exampleParts: [],
      page: line.page,
      method,
      confidence,
      flags: new Set(flags),
      startX: line.x,
      defX,
      mode: 'definition',
      last: line,
    };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];
    const { text: body, bulleted } = stripBullet(line.text);
    const text = body.trim();
    if (!text) continue;
    const current = draft as Draft | null;

    // Section headings switch glossary mode on and off.
    if (GLOSSARY_HEADING.test(text) && words(text).length <= 4) {
      closeDraft();
      flushProse();
      glossaryMode = true;
      continue;
    }
    if (glossaryMode && SECTION_END_HEADING.test(text) && words(text).length <= 8 && !parseDelimited(text)) {
      glossaryMode = false;
    }

    const gapOk = current ? isNormalGap(current.last, line) : false;
    const lastPart = current
      ? current.mode === 'example'
        ? current.exampleParts[current.exampleParts.length - 1]
        : current.defParts[current.defParts.length - 1]
      : undefined;

    // 1. Example line attached to the open entry.
    const ex = text.match(EXAMPLE_RE);
    if (ex && current && gapOk) {
      current.exampleParts.push(ex[1]);
      current.mode = 'example';
      current.last = line;
      continue;
    }

    // 2. Mid-sentence continuation: the previous line did not finish a sentence and this one
    //    starts lowercase. If the previous line ended short of the margin, a line that reads
    //    as its own "term: definition" entry starts a new entry instead.
    if (
      current &&
      gapOk &&
      !bulleted &&
      line.cells.length < 2 &&
      lastPart &&
      !endsSentence(lastPart) &&
      startsLowercase(text) &&
      (wrapped(current.last) || !parseDelimited(text))
    ) {
      (current.mode === 'example' ? current.exampleParts : current.defParts).push(text);
      current.last = line;
      continue;
    }

    // 3. Table row with a term column and a definition column.
    if (line.cells.length >= 2) {
      const left = line.cells[0].text.replace(BULLET_RE, '');
      const right = line.cells
        .slice(1)
        .map((c) => c.text)
        .join(' ');
      const leftNorm = normalizeText(left);
      if (HEADER_ROW_LEFT.has(leftNorm) && HEADER_ROW_RIGHT.test(normalizeText(right))) {
        closeDraft();
        continue;
      }
      const leftOk = isPlausibleTerm(left, 6) && !(/\.$/.test(left.trim()) && left.trim().length > 5);
      if (leftOk && words(right).length >= 1 && !parseDelimited(left)?.definition) {
        const flags: EntryFlag[] = words(right).length < 2 ? ['short-definition'] : [];
        startDraft(line, left, right, 'table', 'high', flags, line.cells[1].x);
        continue;
      }
    }

    // 4. Delimited "Term: definition" style line.
    const delim = parseDelimited(text);
    if (delim) {
      const termNorm = normalizeText(cleanTerm(delim.term));
      if (TERM_LIST_LABELS.has(termNorm)) {
        const items = splitTermList(delim.definition);
        if (items.length > 0) {
          closeDraft();
          flushProse();
          for (const t of items) {
            drafts.push({
              term: t,
              defParts: [],
              exampleParts: [],
              page: line.page,
              method: 'term-list',
              confidence: 'low',
              flags: new Set<EntryFlag>(['no-definition']),
              startX: line.x,
              defX: null,
              mode: 'definition',
              last: line,
            });
          }
          continue;
        }
      } else {
        const termWords = words(cleanTerm(delim.term)).length;
        const defWords = words(delim.definition).length;
        const flags: EntryFlag[] = [];
        let confidence: Confidence = 'high';
        if (termWords > 5) {
          flags.push('long-term');
          confidence = 'medium';
        }
        if (defWords === 1) flags.push('short-definition');
        // A spaced hyphen inside ordinary prose is weaker evidence than a colon.
        if (delim.kind === 'dash' && !bulleted && termWords > 3 && startsLowercase(delim.term)) confidence = 'medium';
        startDraft(line, delim.term, delim.definition, 'delimiter', confidence, flags);
        continue;
      }
    }

    // 5. A term alone on its line, followed by its definition (glossaries, indented definitions).
    if (next && !bulleted && isPlausibleTerm(text, 6) && !/[.,;]$/.test(text) && words(text).length <= 6) {
      const nextBody = stripBullet(next.text).text.trim();
      const nextIsEntry = parseDelimited(nextBody) !== null;
      const nextGapOk = next.page === line.page && isNormalGap(line, next);
      const indented = next.x > line.x + Math.max(line.fontSize, 8) * 0.8;
      if (nextGapOk && !nextIsEntry && words(nextBody).length >= 3 && next.cells.length < 2) {
        if (glossaryMode) {
          startDraft(line, text, '', 'glossary', 'high');
          continue;
        }
        const atLeftMargin = Math.abs(line.x - (leftMargin.get(line.page) ?? line.x)) <= Math.max(line.fontSize, 8) * 2;
        if (indented && atLeftMargin) {
          startDraft(line, text, '', 'layout', 'medium', ['layout-inferred']);
          continue;
        }
      }
    }

    // 6. Continuation of the open entry's definition (or example).
    if (current && gapOk && !bulleted) {
      const totalLength = current.defParts.join(' ').length;
      const alignedWithTable = current.defX === null || Math.abs(line.x - current.defX) <= Math.max(line.fontSize, 8) * 1.5;
      const notOutdented = line.x >= current.startX - Math.max(line.fontSize, 8) * 0.5;
      const awaitingDefinition = current.defParts.length === 0;
      if (alignedWithTable && notOutdented && totalLength < 1200 && (awaitingDefinition || !endsSentence(lastPart ?? '') || current.method !== 'delimiter')) {
        (current.mode === 'example' ? current.exampleParts : current.defParts).push(text);
        current.last = line;
        continue;
      }
    }

    // 7. Anything else is prose; keep it for sentence-pattern detection.
    closeDraft();
    if (!proseBuf || (proseBuf.parts.length && !isNormalGap(lines[i - 1], line))) {
      flushProse();
      proseBuf = { parts: [], page: line.page };
    }
    proseBuf.parts.push(line.text);
  }
  closeDraft();
  flushProse();

  const entries: ExtractedEntry[] = drafts.map(draftToEntry);
  for (const buf of prose) entries.push(...extractFromProse(joinLines(buf.parts), buf.page));

  // Keep document order: by page, then by the order found.
  const ordered = entries
    .map((e, idx) => ({ e, idx }))
    .sort((a, b) => (a.e.page ?? 0) - (b.e.page ?? 0) || a.idx - b.idx)
    .map((x) => x.e);

  const { entries: deduped, removed: duplicatesRemoved } = dedupeEntries(ordered);
  const pageTexts: PageText[] = pages.map((p) => ({
    page: p.page,
    text: p.lines.map((l) => l.cells.map((c) => c.text).join('    ')).join('\n'),
  }));
  fillMissingDefinitions(deduped, pageTexts);

  if (opts.ocr) deduped.forEach((e) => addFlag(e, 'ocr'));
  deduped.forEach(finalizeSelection);

  return {
    entries: deduped,
    pages: pageTexts,
    stats: {
      pageCount: rawPages.length,
      pagesWithText: rawPages.filter((p) => p.charCount > 0).length,
      charCount: rawPages.reduce((n, p) => n + p.charCount, 0),
      removedHeaderFooterLines: removed,
      duplicatesRemoved,
      entries: deduped.length,
      flagged: deduped.filter((e) => e.flags.length > 0).length,
    },
  };
}

function addFlag(e: ExtractedEntry, flag: EntryFlag) {
  if (!e.flags.includes(flag)) e.flags.push(flag);
}

function splitExample(definition: string): { definition: string; example: string } {
  const m = definition.match(/^(.*?[.;])\s+(?:Example|Ex|E\.g\.|For example)\s*[:,\-–—]\s*(.+)$/i);
  if (m && m[1].length > 3) return { definition: m[1], example: m[2] };
  return { definition, example: '' };
}

function draftToEntry(d: Draft): ExtractedEntry {
  let definition = cleanDefinition(joinLines(d.defParts));
  let example = cleanDefinition(joinLines(d.exampleParts));
  if (!example) {
    const split = splitExample(definition);
    definition = split.definition;
    example = split.example;
  }
  const entry: ExtractedEntry = {
    id: uid('e'),
    term: d.term,
    definition,
    example,
    page: d.page,
    selected: false,
    confidence: d.confidence,
    flags: [...d.flags],
    method: d.method,
  };
  return entry;
}

function finalizeSelection(e: ExtractedEntry) {
  if (!e.definition) addFlag(e, 'no-definition');
  if (e.definition.length > 600) {
    addFlag(e, 'long-definition');
    if (e.confidence === 'high') e.confidence = 'medium';
  }
  if (words(e.term).length > 6) addFlag(e, 'long-term');
  e.selected = Boolean(e.term && e.definition) && e.confidence !== 'low' && !e.flags.includes('found-elsewhere');
}

// ---------- Prose patterns ----------

const DEFINING_VERB =
  /^(.{2,70}?)\s+(?:is|are)\s+(?:defined as|described as|known as|termed|the term for|a term for)\s+(.{5,})$/i;
const DEFINING_VERB2 = /^(.{2,70}?)\s+(?:refers to|refer to|means|denotes|can be defined as|is used to describe)\s+(.{5,})$/i;
const CALLED_REVERSED =
  /^(.{12,300}?)\s+(?:is|are)\s+(?:called|known as|termed|referred to as)\s+(?:an?\s+|the\s+)?["“]?([^,;.]{2,50}?)["”]?\s*\.?$/i;
const COPULA = /^(.{2,50}?)\s+(?:is|are)\s+((?:an?|the)\s+.{8,})$/;

function stripArticle(s: string): string {
  return s.replace(/^(?:the|an?)\s+/i, '');
}

function makeEntry(
  term: string,
  definition: string,
  page: number,
  confidence: Confidence,
  method: ExtractionMethod,
  flags: EntryFlag[],
): ExtractedEntry {
  return {
    id: uid('e'),
    term: cleanTerm(term),
    definition: cleanDefinition(definition),
    example: '',
    page,
    selected: false,
    confidence,
    flags,
    method,
  };
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“(]?[\p{Lu}\d])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractFromProse(text: string, page: number): ExtractedEntry[] {
  const out: ExtractedEntry[] = [];
  for (const sentence of splitSentences(text)) {
    if (sentence.length > 500) continue;
    const reversed = sentence.match(CALLED_REVERSED);
    if (reversed && words(reversed[1]).length > 5 && isPlausibleTerm(reversed[2], 5)) {
      out.push(makeEntry(reversed[2], reversed[1], page, 'medium', 'sentence', ['sentence-pattern']));
      continue;
    }
    const m = sentence.match(DEFINING_VERB) ?? sentence.match(DEFINING_VERB2);
    if (m && isPlausibleTerm(stripArticle(m[1]), 6) && /^[\p{Lu}"“]/u.test(m[1])) {
      out.push(makeEntry(stripArticle(m[1]), m[2], page, 'medium', 'sentence', ['sentence-pattern']));
      continue;
    }
    const c = sentence.match(COPULA);
    if (c && /^\p{Lu}/u.test(c[1]) && isPlausibleTerm(stripArticle(c[1]), 4) && words(c[2]).length >= 4) {
      out.push(makeEntry(stripArticle(c[1]), c[2], page, 'low', 'sentence', ['sentence-pattern']));
    }
  }
  return out;
}

// ---------- Duplicates and missing definitions ----------

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

export function dedupeEntries(entries: ExtractedEntry[]): { entries: ExtractedEntry[]; removed: number } {
  const out: ExtractedEntry[] = [];
  const byTerm = new Map<string, ExtractedEntry[]>();
  let removed = 0;
  for (const e of entries) {
    const key = normalizeText(e.term);
    if (!key) continue;
    const group = byTerm.get(key) ?? [];
    const defKey = normalizeText(e.definition);
    const exact = group.find((g) => normalizeText(g.definition) === defKey);
    if (exact) {
      removed++;
      continue;
    }
    // A term-only entry adds nothing when the same term already has a definition.
    if (!defKey && group.some((g) => g.definition)) {
      removed++;
      continue;
    }
    const emptyTwin = group.find((g) => !g.definition);
    if (defKey && emptyTwin) {
      Object.assign(emptyTwin, {
        definition: e.definition,
        example: emptyTwin.example || e.example,
        method: e.method,
        confidence: e.confidence,
        flags: e.flags.filter((f) => f !== 'no-definition'),
        page: emptyTwin.page ?? e.page,
      });
      removed++;
      continue;
    }
    if (group.length > 0) {
      addFlag(e, 'duplicate');
      group.forEach((g) => addFlag(g, 'duplicate'));
    }
    group.push(e);
    byTerm.set(key, group);
    out.push(e);
  }
  // Within a duplicate group, only the most confident entry stays selected by default.
  for (const group of byTerm.values()) {
    if (group.length < 2) continue;
    const best = [...group].sort(
      (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence] || b.definition.length - a.definition.length,
    )[0];
    for (const g of group) if (g !== best) g.confidence = 'low';
  }
  return { entries: out, removed };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * For terms listed without a definition, look for a defining sentence
 * elsewhere in the document. Matches stay unselected and flagged.
 */
export function fillMissingDefinitions(entries: ExtractedEntry[], pages: PageText[]) {
  const missing = entries.filter((e) => !e.definition);
  if (missing.length === 0) return;
  const flat = pages.map((p) => ({ page: p.page, text: joinLines(p.text.split('\n')) }));
  for (const e of missing) {
    const re = new RegExp(
      `(?:^|[.!?]\\s+)(?:the\\s+|an?\\s+)?${escapeRegExp(e.term)}\\s+(?:is|are|refers to|means|is defined as)\\s+([^.!?]{5,300}[.!?])`,
      'i',
    );
    for (const p of flat) {
      const m = p.text.match(re);
      if (m) {
        e.definition = cleanDefinition(m[1]);
        e.flags = e.flags.filter((f) => f !== 'no-definition');
        addFlag(e, 'found-elsewhere');
        break;
      }
    }
  }
}

// ---------- Plain text (paste) ----------

/** Run the same detection on pasted text. Tabs become table columns; blank lines become paragraph breaks. */
export function extractFromPlainText(text: string): ExtractedEntry[] {
  const lines: TextLine[] = [];
  let y = 10_000;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) {
      y -= 30;
      continue;
    }
    const indent = (raw.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length;
    const cellTexts = raw.trim().split(/\t+|\s{3,}/);
    let x = indent * 6;
    const cells = cellTexts.map((c, idx) => {
      const cell = { text: c.trim(), x: idx === 0 ? x : x + 200 * idx };
      return cell;
    });
    x = cells[0].x;
    lines.push({ text: cells.map((c) => c.text).join(' '), cells, x, endX: 0, y, fontSize: 12, page: 1 });
    y -= 14;
  }
  const result = extractVocabulary([{ page: 1, width: 0, height: 0, lines, charCount: text.length }]);
  return result.entries.map((e) => ({ ...e, page: null }));
}

export const FLAG_LABELS: Record<EntryFlag, { label: string; description: string }> = {
  'no-definition': {
    label: 'No definition',
    description: 'The term was found, but no definition could be extracted. Add one or remove the entry.',
  },
  'short-definition': { label: 'Short', description: 'The definition is a single word. Check that it is complete.' },
  'long-definition': {
    label: 'Long',
    description: 'The definition is unusually long and may include text from the next section.',
  },
  'long-term': { label: 'Long term', description: 'The term is long; it may be a phrase rather than a term.' },
  duplicate: { label: 'Duplicate', description: 'The same term appears more than once with different definitions.' },
  'sentence-pattern': {
    label: 'From sentence',
    description: 'Found in a sentence such as "X is defined as Y". Confirm the term and definition.',
  },
  'layout-inferred': {
    label: 'From layout',
    description: 'Paired from page layout (a term line followed by indented text). Confirm the pairing.',
  },
  'found-elsewhere': {
    label: 'Found elsewhere',
    description: 'The term was listed without a definition; this definition came from another sentence in the document.',
  },
  ocr: { label: 'OCR', description: 'Read with OCR. Check for recognition errors.' },
};
