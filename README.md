# Recall: a private study site for vocabulary from your PDFs

Recall is a personal, Quizlet-style study website that runs entirely in your browser. Upload class notes, textbook
chapters, or study guides as PDFs, review the terms and definitions it finds, and study them with flashcards,
multiple-choice quizzes, written recall, and a matching game. A simple spaced-repetition schedule brings cards back
before you forget them.

It is a static site: no server, no database service, no account, no API keys, and no subscription. It is built to be
hosted for free on GitHub Pages.

Once deployed, the site for this repository lives at **https://aguin005.github.io/Flashcards/**.

## Features

**PDF import**
- Drag and drop or browse for a PDF. Text is extracted page by page with [PDF.js](https://mozilla.github.io/pdf.js/), with a progress bar and a cancel button.
- Detects `Term: definition`, `Term - definition`, `Term – definition`, `Term — definition`, `Term = definition`, bulleted and numbered lists, dictionary entries like `abate (v.) to lessen`, two-column tables (including wrapped cells), glossary sections (a term on its own line), indented definitions, `Key terms: a, b, c` lists, and sentences such as "X refers to Y" or "Y is called X".
- Attaches `Example:` / `e.g.` lines to the term above them and records the source page of every entry.
- Removes repeated headers, footers, and page numbers; joins hyphenated line breaks; merges exact duplicates.
- **Never invents definitions.** Uncertain pairs are flagged ("Check", "From sentence", "From layout", "Duplicate") and low-confidence ones start unselected. A term with no definition in the document is kept with an empty definition and a "No definition" flag.
- Clear errors for empty, non-PDF, corrupted, password-protected (with an unlock box), and scanned image-only PDFs.
- Optional OCR for scanned PDFs (tesseract.js). The OCR engine is served by this site itself, so no third-party server is contacted; it downloads about 15 MB the first time you use it.
- Review screen: edit terms, definitions, examples, and page numbers; delete or add entries; search and filter (selected, needs review, duplicates, incomplete); remove duplicates; select which entries to import; view the extracted text page by page; save as a new set or add to an existing one. The draft is autosaved, so a refresh does not lose your review work.

**Study sets**
- Create, edit, rename, duplicate, and delete sets; add and delete cards; paste terms (tab, colon, or dash separated).
- Title, class or subject, description, optional examples, accepted alternate answers, source page, and starred status per card.
- Search within a set; filter starred or difficult cards; sort A to Z, weakest first, or shuffled.
- Export a set as JSON or CSV; import JSON sets.
- Open the stored source PDF at a card's page (when you keep a copy of the PDF).

**Study modes** (full-screen, distraction-free layout)
- **Flashcards:** flip with a click or Space, previous/next, keyboard shortcuts, shuffle, term or definition first, Know it / Still learning, repeat still-learning cards, starred-only, and resume where you left off.
- **Multiple choice:** definition-to-term and term-to-definition questions with four options (fewer for small sets), distractors taken only from other cards, exactly one correct answer, instant feedback with explanation, score and percentage, missed-question review, retry missed, question count, and all or difficult cards.
- **Written recall:** type the term or the definition; Enter to submit; case, spacing, and punctuation are ignored; stored alternates accepted; likely typos and partial definitions are marked "close" and you decide; you can override any grade.
- **Match:** pair terms with definitions in rounds of 4, 6, or 8; mistakes and time are tracked; best times are remembered.

**Spaced repetition and progress**
- Leitner boxes: New, Learning, Developing, Familiar, Mastered. Correct answers push the next review further out (1, 3, 7, then 16+ days); a miss brings a card back in 10 minutes. A card is only promoted when it is due, so it cannot become Mastered in one sitting.
- Review Due page with counts for now, later today, tomorrow, and the next 7 days.
- Dashboard with review due, daily goal, streak, recently studied sets, and an Upload PDF button.
- Progress page with total sets, cards, cards studied, mastered, cards needing review, overall accuracy, current and longest streak, cards reviewed per day (7 or 30 days, chart or table), mastery by set, recent sessions, and the most frequently missed terms. Every number is computed from your saved activity.

**Interface:** sidebar on desktop, bottom navigation on phones, light/dark/system theme, global search (press `/`), accessible dialogs, toasts, keyboard support, and reduced-motion support.

## Privacy and storage

- PDFs are processed in the browser tab. Nothing is uploaded anywhere.
- Study sets, card progress, sessions, import drafts, and stored PDFs are kept in **IndexedDB**. Small preferences (theme, daily goal, study options) are kept in **localStorage**.
- Nothing leaves your device unless you export a file.
- Browser storage can be cleared by you or by the browser (clearing site data, private windows, low disk space). Use **Settings → Export all data** regularly; **Import backup** restores it (merge or replace). Settings also shows storage use, can ask the browser to protect the data from automatic cleanup, lists stored PDFs, and can delete all local data after you type `DELETE`.
- If a browser blocks IndexedDB (some private modes), the app still runs but shows a warning that data will not be saved.

## Tech stack

React 19, TypeScript, Vite 7, Tailwind CSS 4, Lucide icons, PDF.js (`pdfjs-dist`, legacy build for wider browser support), `idb` for IndexedDB, tesseract.js for optional OCR, Vitest and Playwright for tests. Charts are small hand-written SVG components rather than a chart library.

## Run it locally

Requirements: [Node.js](https://nodejs.org/) 20.19+ or 22.12+ and npm.

```bash
git clone https://github.com/aguin005/Flashcards.git
cd Flashcards
npm install
npm run dev
```

Open the address Vite prints (usually http://localhost:5173/).

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and build to `dist/` for the root path `/` |
| `npm run build:pages` | Build for the `/Flashcards/` subpath, exactly as GitHub Pages serves it |
| `npm run preview` | Serve the last build (add `--base /Flashcards/` after a `build:pages`) |
| `npm run typecheck` | TypeScript only |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) against the `/Flashcards/` production build |

Before the first end-to-end run, install the browser once: `npx playwright install chromium`.

`npm run dev` and `npm run build` first run `scripts/copy-assets.mjs`, which copies the PDF.js character maps and fonts and the OCR engine from `node_modules` into `public/` (these copies are git-ignored).

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys the site every time you push to `main`.

### 1. Create the repository (skip if it already exists)

1. On GitHub, click **New repository**, name it (for example `Flashcards`), and create it. Public repositories get GitHub Pages on free accounts.
2. Push this project to it:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
   git push -u origin main
   ```

### 2. Turn on GitHub Pages with GitHub Actions

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push to `main` (or open **Actions → Deploy to GitHub Pages → Run workflow**).
4. When the run finishes, the site is at `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`. For this repository: https://aguin005.github.io/Flashcards/.

### How the subpath works

GitHub Pages serves project sites from `/<repository-name>/`. The workflow sets `BASE_PATH=/<repository-name>/` before building, and `vite.config.ts` uses it as Vite's `base`, so all JavaScript, CSS, the PDF.js worker, and the OCR files load from the right place. If you rename the repository, nothing needs to change. If the repository is a user site named `YOUR-USERNAME.github.io`, the workflow builds for `/` instead.

The app uses hash-based URLs (for example `/Flashcards/#/sets`), so refreshing any page works without server-side routing or a custom 404 page. No custom domain is needed.

### Continuous integration

`.github/workflows/ci.yml` runs the type-check, unit tests, and Playwright end-to-end tests on pull requests and on pushes to branches other than `main`. The deploy workflow also runs the unit tests before building.

## Testing

- **Unit tests** (`tests/unit`): vocabulary extraction rules, PDF line reconstruction, the real fixture PDFs run through PDF.js, quiz generation (unique options, exactly one correct answer, fewer options for small sets), written-answer grading, the Leitner schedule (no one-sitting mastery), matching rounds, statistics, and JSON/CSV export and import.
- **End-to-end tests** (`tests/e2e`): upload and edit extracted vocabulary, save and reload, every PDF error case, password unlock, OCR, flashcards (flip, navigate, resume, repeat), quiz with retry, written recall with overrides, matching, spaced repetition with a simulated clock, progress statistics, set editing, duplicate, delete, JSON/CSV export and re-import, full backup/clear/restore, theme persistence, and a phone-sized layout check.
- Test PDFs live in `tests/fixtures`. Regenerate them with `node scripts/make-fixtures.mjs`, `python3 scripts/encrypt-fixture.py` (needs `pip install pypdf`), and `node scripts/make-scanned-fixture.mjs`.

## Project structure

```
src/
  components/      layout (sidebar, mobile nav, focus layout, search) and UI primitives
  features/
    pdf-import/    dropzone, review rows, OCR
    flashcards/  quiz/  written/  matching/   study modes
    progress/      activity chart
    sets/          JSON/CSV transfer helpers
    study-shared/  setup controls and results screen shared by quiz and written
  hooks/           study session recording
  lib/
    pdf-parser.ts            PDF.js loading, error mapping, line reconstruction
    vocabulary-extractor.ts  term/definition detection, cleanup, flags
    spaced-repetition.ts     Leitner boxes and mastery levels
    quiz.ts  grading.ts  matching.ts  stats.ts  export.ts
    db.ts                    IndexedDB (with in-memory fallback)
    storage.ts               localStorage preferences
  pages/           one file per route
  state/           app data provider (sets, progress, sessions)
  types/
tests/  unit/  e2e/  fixtures/
scripts/           asset copy and fixture generation
.github/workflows/ deploy.yml, ci.yml
```

## Tips for good extraction

- Text-based PDFs (exported from Word, Google Docs, slides, or a textbook publisher) work best.
- One term per line with a colon or dash gives the most reliable results; tables with a term column and a definition column work well too.
- Multi-column page layouts are read in the order the PDF stores its text, which is usually but not always reading order. Check the review screen, and use **Extracted text** to copy anything that was missed.

## Known limitations

- Extraction is rule-based. It does not understand meaning, so it can miss definitions written in free-flowing prose or split a definition in an unusual layout. That is why every result goes through the review screen.
- Bold or italic formatting is not used as a signal (PDF.js text extraction does not expose it reliably).
- OCR is optional, English only, and slower; accuracy depends on scan quality. Results are flagged for review.
- Written-answer grading is local and rule-based. Long definitions are rarely an exact match, so they are often marked "close" for you to judge.
- Data lives in one browser on one device. There is no sync; move data between devices with Export all data and Import backup. Stored PDF files are not included in backups.
- There is no offline mode (no service worker), so the site needs a connection to open. Your data itself never leaves the browser.
