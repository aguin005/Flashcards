export type ID = string;

/** A single vocabulary card inside a study set. */
export interface Card {
  id: ID;
  term: string;
  definition: string;
  example?: string;
  /** Extra accepted answers for the term in written recall (synonyms, abbreviations). */
  alternates?: string[];
  /** 1-based page number in the source PDF, when known. */
  sourcePage?: number;
  starred?: boolean;
  createdAt: number;
}

export interface StudySetSource {
  fileName: string;
  importId?: ID;
  pageCount?: number;
}

export interface StudySet {
  id: ID;
  title: string;
  description: string;
  /** Class or subject label, e.g. "BIO 101". */
  subject?: string;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
  source?: StudySetSource;
}

/** A card paired with the set it belongs to, used by study modes. */
export interface StudyCard extends Card {
  setId: ID;
  setTitle: string;
}

export type MasteryLevel = 'new' | 'learning' | 'developing' | 'familiar' | 'mastered';

/** Spaced-repetition state for one card (Leitner boxes 0-5). */
export interface CardProgress {
  cardId: ID;
  setId: ID;
  box: number;
  reviews: number;
  correct: number;
  incorrect: number;
  /** Consecutive correct answers. */
  streak: number;
  lastReviewedAt?: number;
  nextReviewAt?: number;
  lastResult?: 'correct' | 'incorrect';
}

export type StudyMode = 'flashcards' | 'quiz' | 'written' | 'matching';

export interface StudySession {
  id: ID;
  setIds: ID[];
  mode: StudyMode;
  isReview: boolean;
  startedAt: number;
  endedAt: number;
  /** Number of graded answers in the session. */
  total: number;
  correct: number;
  incorrect: number;
  /** Number of distinct cards seen. */
  cardsStudied: number;
}

export interface AnswerRecord {
  cardId: ID;
  setId: ID;
  correct: boolean;
}

// ---------- PDF import ----------

export type Confidence = 'high' | 'medium' | 'low';

export type ExtractionMethod =
  | 'delimiter'
  | 'table'
  | 'glossary'
  | 'layout'
  | 'sentence'
  | 'term-list'
  | 'manual';

export type EntryFlag =
  | 'no-definition'
  | 'short-definition'
  | 'long-definition'
  | 'long-term'
  | 'duplicate'
  | 'sentence-pattern'
  | 'layout-inferred'
  | 'found-elsewhere'
  | 'ocr';

export interface ExtractedEntry {
  id: ID;
  term: string;
  definition: string;
  example: string;
  page: number | null;
  selected: boolean;
  confidence: Confidence;
  flags: EntryFlag[];
  method: ExtractionMethod;
}

/** One reconstructed line of text from a PDF page. */
export interface TextLine {
  text: string;
  /** Text segments separated by wide horizontal gaps (table columns). */
  cells: { text: string; x: number }[];
  x: number;
  /** Right edge of the line; 0 when unknown (pasted text). */
  endX: number;
  y: number;
  fontSize: number;
  page: number;
}

export interface ParsedPage {
  page: number;
  width: number;
  height: number;
  lines: TextLine[];
  charCount: number;
}

export interface PageText {
  page: number;
  text: string;
}

export interface ExtractionStats {
  pageCount: number;
  pagesWithText: number;
  charCount: number;
  removedHeaderFooterLines: number;
  duplicatesRemoved: number;
  entries: number;
  flagged: number;
}

export interface PdfImport {
  id: ID;
  fileName: string;
  fileSize: number;
  pageCount: number;
  createdAt: number;
  updatedAt: number;
  pages: PageText[];
  entries: ExtractedEntry[];
  stats: ExtractionStats;
  /** True when a copy of the PDF file is kept in IndexedDB. */
  hasFile: boolean;
  usedOcr?: boolean;
  savedSetId?: ID;
}

export interface StoredFile {
  id: ID;
  name: string;
  type: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

// ---------- Preferences (localStorage) ----------

export type ThemePref = 'light' | 'dark' | 'system';
export type QuestionDirection = 'term-to-definition' | 'definition-to-term';
export type DirectionPref = QuestionDirection | 'mixed';

export interface Prefs {
  theme: ThemePref;
  /** Cards to review per day. */
  dailyGoal: number;
  flashcardFront: 'term' | 'definition';
  flashcardShuffle: boolean;
  quizCount: number;
  quizDirection: DirectionPref;
  writtenDirection: DirectionPref;
  matchPairs: number;
  keepPdfCopies: boolean;
}
