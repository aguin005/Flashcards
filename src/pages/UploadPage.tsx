import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  CircleAlert,
  ClipboardPaste,
  FileText,
  FileUp,
  Lock,
  ScanText,
  ShieldCheck,
  Trash,
  TriangleAlert,
} from 'lucide-react';
import { Dropzone } from '../features/pdf-import/Dropzone';
import { PastePanel, type PasteState } from '../features/pdf-import/PastePanel';
import { Button, buttonClass } from '../components/ui/Button';
import { Badge, Input, PageHeader, Panel, ProgressBar, Segmented, Switch } from '../components/ui/primitives';
import { useConfirm, useToast } from '../components/ui/feedback';
import { parsePdf, PdfError, PDF_ERROR_TEXT, type PdfErrorCode } from '../lib/pdf-parser';
import { extractVocabulary, type ExtractionResult } from '../lib/vocabulary-extractor';
import { formatForFileName, isTextFile } from '../lib/paste-parser';
import { deleteImport, listImports, saveFile, saveImport } from '../lib/imports';
import { LS_PREFIX, readJSON, removeKey, setPrefs, usePrefs, writeJSON } from '../lib/storage';
import { errorMessage, formatBytes, formatRelative, pluralize, uid } from '../lib/utils';
import type { ParsedPage, PdfImport } from '../types';
import { useAppData } from '../state/AppData';
import type { OcrProgress } from '../features/pdf-import/ocr';
import { pickFile } from '../features/sets/transfer';

const MAX_FILE_BYTES = 150 * 1024 * 1024;
/** Fewer characters than this per page on average means the PDF is probably scanned images. */
const MIN_CHARS_PER_PAGE = 25;

const PASTE_DRAFT_KEY = `${LS_PREFIX}paste-draft`;
const EMPTY_PASTE: PasteState = { text: '', format: 'auto', separator: '' };
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024;

type Mode = 'pdf' | 'paste';

type Stage =
  | { kind: 'idle' }
  | { kind: 'reading'; file: File }
  | { kind: 'extracting'; file: File; done: number; total: number }
  | { kind: 'ocr'; file: File; progress: OcrProgress }
  | { kind: 'detecting'; file: File }
  | { kind: 'error'; file: File; code: PdfErrorCode; message: string };

export default function UploadPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sets } = useAppData();
  const prefs = usePrefs();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [imports, setImports] = useState<PdfImport[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [params, setParams] = useSearchParams();
  const mode: Mode = params.get('mode') === 'paste' ? 'paste' : 'pdf';
  const setMode = useCallback(
    (next: Mode) => {
      setParams(next === 'paste' ? { mode: 'paste' } : {}, { replace: true });
    },
    [setParams],
  );
  // The paste box is kept in localStorage so switching apps on a phone (which can reload the tab) loses nothing.
  const [paste, setPaste] = useState<PasteState>(() => ({ ...EMPTY_PASTE, ...readJSON<Partial<PasteState>>(PASTE_DRAFT_KEY, {}) }));
  const [savingPaste, setSavingPaste] = useState(false);
  const updatePaste = useCallback((patch: Partial<PasteState>) => setPaste((p) => ({ ...p, ...patch })), []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (paste.text.trim()) writeJSON(PASTE_DRAFT_KEY, paste);
      else removeKey(PASTE_DRAFT_KEY);
    }, 400);
    return () => clearTimeout(t);
  }, [paste]);

  const refreshImports = () =>
    listImports()
      .then(setImports)
      .catch(() => setImports([]));

  useEffect(() => {
    void refreshImports();
    return () => abortRef.current?.abort();
  }, []);

  // Clicking "Upload PDF" again (a new navigation to this page) starts over.
  // Switching between the Upload and Paste tabs only changes the query string and keeps everything.
  const location = useLocation();
  const firstLocation = useRef(location.key);
  const lastSearch = useRef(location.search);
  useEffect(() => {
    const tabSwitch = location.search !== lastSearch.current;
    lastSearch.current = location.search;
    if (location.key === firstLocation.current || tabSwitch) return;
    abortRef.current?.abort();
    setPassword('');
    setStage({ kind: 'idle' });
  }, [location.key, location.search]);

  const finish = async (file: File, pages: ParsedPage[], pageCount: number, usedOcr: boolean) => {
    setStage({ kind: 'detecting', file });
    // Let the "Detecting vocabulary" state paint before the synchronous extraction runs.
    await new Promise((r) => setTimeout(r, 30));
    const result = extractVocabulary(pages, { ocr: usedOcr });
    const id = uid('imp');
    let hasFile = false;
    if (prefs.keepPdfCopies) {
      try {
        await saveFile(id, file);
        hasFile = true;
      } catch (err) {
        toast({ kind: 'error', title: 'The PDF copy was not saved', description: errorMessage(err) });
      }
    }
    const now = Date.now();
    const record: PdfImport = {
      id,
      fileName: file.name,
      fileSize: file.size,
      pageCount,
      createdAt: now,
      updatedAt: now,
      pages: result.pages,
      entries: result.entries,
      stats: result.stats,
      hasFile,
      usedOcr,
    };
    await saveImport(record);
    navigate(`/upload/${id}`);
  };

  const finishText = async (result: ExtractionResult) => {
    setSavingPaste(true);
    try {
      const now = Date.now();
      const id = uid('imp');
      await saveImport({
        id,
        kind: 'text',
        fileName: paste.fileName ?? 'Pasted text',
        fileSize: paste.text.length,
        pageCount: 1,
        createdAt: now,
        updatedAt: now,
        pages: result.pages,
        entries: result.entries,
        stats: result.stats,
        hasFile: false,
      });
      removeKey(PASTE_DRAFT_KEY);
      setPaste(EMPTY_PASTE);
      navigate(`/upload/${id}`);
    } catch (err) {
      toast({ kind: 'error', title: 'Could not save the pasted text', description: errorMessage(err) });
    } finally {
      setSavingPaste(false);
    }
  };

  const loadTextFile = async (file: File) => {
    if (file.size > MAX_TEXT_FILE_BYTES) {
      toast({ kind: 'error', title: 'That text file is too large', description: `Files up to ${formatBytes(MAX_TEXT_FILE_BYTES)} are supported.` });
      return;
    }
    try {
      const text = await file.text();
      setPaste((p) => ({ ...p, text, fileName: file.name, format: formatForFileName(file.name) ?? p.format }));
      setMode('paste');
    } catch (err) {
      toast({ kind: 'error', title: 'Could not read that file', description: errorMessage(err) });
    }
  };

  const appendPastedText = (text: string) => {
    setPaste((p) => ({ ...p, text: p.text.trim() ? `${p.text.replace(/\s+$/, '')}\n${text}` : text }));
    setMode('paste');
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast({ title: 'Your clipboard has no text' });
        return;
      }
      appendPastedText(text);
    } catch {
      toast({
        kind: 'info',
        title: 'The browser blocked clipboard access',
        description: 'Tap and hold in the box, then choose Paste. On a computer, press Ctrl+V (Cmd+V on a Mac).',
      });
    }
  };

  const processFile = async (file: File, pdfPassword?: string) => {
    if (isTextFile(file)) {
      await loadTextFile(file);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const fail = (code: PdfErrorCode, message?: string) =>
      setStage({ kind: 'error', file, code, message: message ?? PDF_ERROR_TEXT[code].detail });

    if (file.size === 0) return fail('empty-file');
    const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksPdf) return fail('not-pdf');
    if (file.size > MAX_FILE_BYTES) {
      return fail('unknown', `This PDF is ${formatBytes(file.size)}. Files up to ${formatBytes(MAX_FILE_BYTES)} are supported.`);
    }

    try {
      setStage({ kind: 'reading', file });
      const data = await file.arrayBuffer();
      const result = await parsePdf(data, {
        password: pdfPassword,
        signal: controller.signal,
        onProgress: (done, total) => {
          if (!controller.signal.aborted) setStage({ kind: 'extracting', file, done, total });
        },
      });
      if (controller.signal.aborted) return;
      if (result.charCount < Math.max(1, result.pageCount) * MIN_CHARS_PER_PAGE) return fail('no-text');
      await finish(file, result.pages, result.pageCount, false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof PdfError) fail(err.code, err.message);
      else fail('unknown', errorMessage(err));
    }
  };

  const runOcr = async (file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStage({ kind: 'ocr', file, progress: { page: 0, total: 0, progress: 0, status: 'Starting' } });
      const { ocrPdf } = await import('../features/pdf-import/ocr');
      const data = await file.arrayBuffer();
      const pages = await ocrPdf(data, {
        password: password || undefined,
        signal: controller.signal,
        onProgress: (progress) => {
          if (!controller.signal.aborted) setStage({ kind: 'ocr', file, progress });
        },
      });
      if (controller.signal.aborted) return;
      const chars = pages.reduce((n, p) => n + p.charCount, 0);
      if (chars < 10) {
        setStage({
          kind: 'error',
          file,
          code: 'unknown',
          message: 'OCR finished but found no readable text. The scan may be too blurry or low-resolution.',
        });
        return;
      }
      await finish(file, pages, pages.length, true);
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof PdfError ? err.message : errorMessage(err);
      setStage({
        kind: 'error',
        file,
        code: 'unknown',
        message: `OCR could not run: ${message}`,
      });
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStage({ kind: 'idle' });
    toast({ title: 'Processing cancelled' });
  };

  const busy = stage.kind === 'reading' || stage.kind === 'extracting' || stage.kind === 'detecting' || stage.kind === 'ocr';

  // Ctrl+V / Cmd+V anywhere on the page (outside a text field): a copied PDF or text file is
  // processed, plain text goes to the paste box.
  const pasteHandler = useRef<(e: ClipboardEvent) => void>(() => undefined);
  pasteHandler.current = (e: ClipboardEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (busy || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    const files = [...(e.clipboardData?.files ?? [])];
    const file = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf') || isTextFile(f));
    if (file) {
      e.preventDefault();
      void processFile(file);
      return;
    }
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.trim()) {
      e.preventDefault();
      appendPastedText(text);
    }
  };
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => pasteHandler.current(e);
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const canReadClipboard = typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';

  return (
    <div>
      <PageHeader
        title="Upload PDF"
        description="Upload a PDF or paste text. The terms and definitions found are shown for review before you save them as a study set."
      />

      <Segmented<Mode>
        label="Add vocabulary from"
        value={mode}
        onChange={setMode}
        className="mb-5 w-full sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none"
        options={[
          {
            value: 'pdf',
            label: (
              <span className="inline-flex items-center justify-center gap-1.5">
                <FileUp className="size-4" aria-hidden /> Upload PDF
              </span>
            ),
          },
          {
            value: 'paste',
            label: (
              <span className="inline-flex items-center justify-center gap-1.5">
                <ClipboardPaste className="size-4" aria-hidden /> Paste text
              </span>
            ),
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          {mode === 'paste' && (
            <PastePanel
              state={paste}
              onChange={updatePaste}
              onPasteFromClipboard={canReadClipboard ? () => void pasteFromClipboard() : undefined}
              onOpenFile={async () => {
                const file = await pickFile('.txt,.csv,.tsv,.md,text/plain,text/csv');
                if (file) await loadTextFile(file);
              }}
              onContinue={(result) => void finishText(result)}
              busy={savingPaste}
            />
          )}

          {mode === 'pdf' && stage.kind === 'idle' && <Dropzone onFile={(f) => void processFile(f)} />}

          {mode === 'pdf' && busy && <ProcessingCard stage={stage} onCancel={cancel} />}

          {mode === 'pdf' && stage.kind === 'error' && (
            <ErrorCard
              stage={stage}
              password={password}
              setPassword={setPassword}
              onRetryPassword={() => void processFile(stage.file, password)}
              onOcr={() => void runOcr(stage.file)}
              onReset={() => {
                setPassword('');
                setStage({ kind: 'idle' });
              }}
            />
          )}

          {mode === 'pdf' && (
          <Panel className="p-5">
            <Switch
              id="keep-pdf"
              checked={prefs.keepPdfCopies}
              onChange={(v) => setPrefs({ keepPdfCopies: v })}
              label="Keep a copy of the PDF in this browser"
              description="Lets you open the source page from a card later. Stored PDFs can be removed in Settings."
            />
          </Panel>
          )}

          <RecentImports
            imports={imports}
            setTitles={new Map(sets.map((s) => [s.id, s.title]))}
            onDelete={async (imp) => {
              const ok = await confirm({
                title: 'Delete this import?',
                message: imp.savedSetId
                  ? 'The review draft (and stored PDF, if any) will be removed. Your saved study set stays.'
                  : 'The review draft (and stored PDF, if any) will be removed.',
                confirmLabel: 'Delete',
                danger: true,
              });
              if (!ok) return;
              try {
                await deleteImport(imp.id);
                void refreshImports();
              } catch (err) {
                toast({ kind: 'error', title: 'Could not delete', description: errorMessage(err) });
              }
            }}
          />
        </div>

        <aside className="space-y-4">
          <Panel className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden /> Processed on your device
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Your PDF or text is read inside this browser tab. It is never uploaded to a server.
            </p>
          </Panel>
          <Panel className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Ways to add vocabulary</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>Upload or drop a PDF, or a .txt or .csv file</li>
              <li>Paste text copied from notes, a website, or a document</li>
              <li>Copy two columns from a spreadsheet and paste them</li>
              <li className="hidden pointer-fine:list-item">Press Ctrl+V (Cmd+V) on this page to paste a copied PDF or text</li>
            </ul>
          </Panel>
          <Panel className="p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Formats detected</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
              <li>
                <code className="text-xs">Term: definition</code>
              </li>
              <li>
                <code className="text-xs">Term - definition</code>, <code className="text-xs">Term — definition</code>
              </li>
              <li>Bulleted and numbered lists</li>
              <li>Two-column vocabulary tables</li>
              <li>Glossaries (term on its own line)</li>
              <li>Sentences like “X refers to Y”</li>
            </ul>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              Nothing is invented: uncertain pairs are flagged so you can check them before saving.
            </p>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function ProcessingCard({ stage, onCancel }: { stage: Stage; onCancel: () => void }) {
  if (!('file' in stage)) return null;
  let label = 'Reading file';
  let value = 0.05;
  let detail = '';
  if (stage.kind === 'extracting') {
    label = 'Extracting text';
    value = stage.total ? 0.1 + (stage.done / stage.total) * 0.8 : 0.1;
    detail = `Page ${stage.done} of ${stage.total}`;
  } else if (stage.kind === 'detecting') {
    label = 'Detecting vocabulary';
    value = 0.95;
  } else if (stage.kind === 'ocr') {
    const { page, total, progress, status } = stage.progress;
    label = status;
    value = total ? (Math.max(0, page - 1) + progress) / total : progress * 0.1;
    detail = page > 0 ? `Page ${page} of ${total}` : 'First run downloads about 15 MB from this site';
  }
  return (
    <Panel className="p-6" aria-live="polite" data-testid="processing">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          {stage.kind === 'ocr' ? <ScanText className="size-5" /> : <FileText className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900 dark:text-white">{stage.file.name}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">{formatBytes(stage.file.size)}</p>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">{label}…</span>
            <span className="text-slate-500 tabular-nums dark:text-slate-400">{detail}</span>
          </div>
          <ProgressBar value={value} className="mt-2" label={label} />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Panel>
  );
}

function ErrorCard({
  stage,
  password,
  setPassword,
  onRetryPassword,
  onOcr,
  onReset,
}: {
  stage: Extract<Stage, { kind: 'error' }>;
  password: string;
  setPassword: (v: string) => void;
  onRetryPassword: () => void;
  onOcr: () => void;
  onReset: () => void;
}) {
  const text = PDF_ERROR_TEXT[stage.code];
  const needsPassword = stage.code === 'password-required' || stage.code === 'password-incorrect';
  const Icon = needsPassword ? Lock : stage.code === 'no-text' ? ScanText : CircleAlert;
  return (
    <Panel className="p-6" role="alert" data-testid="upload-error" data-code={stage.code}>
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900 dark:text-white">{text.title}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{stage.message}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{stage.file.name}</p>

          {needsPassword && (
            <form
              className="mt-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                onRetryPassword();
              }}
            >
              <Input
                type="password"
                aria-label="PDF password"
                placeholder="PDF password"
                value={password}
                autoFocus
                onChange={(e) => setPassword(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button type="submit" disabled={!password}>
                Unlock PDF
              </Button>
            </form>
          )}

          {stage.code === 'no-text' && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
              <p className="font-medium text-slate-800 dark:text-slate-100">Options for scanned PDFs</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Try OCR (optional, experimental).</strong> Recognizes text from page images in your browser.
                  It is slower, works best on clear scans, and the first run downloads about 15 MB of OCR files from
                  this website. Your PDF stays on your device.
                </li>
                <li>If you have the original document, export it to PDF again so the text is selectable.</li>
                <li>You can also create a set and type or paste the terms yourself.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={onOcr} icon={<ScanText className="size-4" />}>
                  Try OCR
                </Button>
                <Link to="/sets/new" className={buttonClass('secondary')}>
                  Create a set manually
                </Link>
              </div>
            </div>
          )}

          <div className="mt-5">
            <Button variant={stage.code === 'no-text' ? 'ghost' : 'secondary'} onClick={onReset}>
              Choose another file
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function RecentImports({
  imports,
  setTitles,
  onDelete,
}: {
  imports: PdfImport[] | null;
  setTitles: Map<string, string>;
  onDelete: (imp: PdfImport) => void;
}) {
  if (!imports || imports.length === 0) return null;
  return (
    <section aria-labelledby="recent-imports">
      <h2 id="recent-imports" className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
        Recent imports
      </h2>
      <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
        {imports.map((imp) => {
          const savedTitle = imp.savedSetId ? setTitles.get(imp.savedSetId) : undefined;
          return (
            <div key={imp.id} className="flex flex-wrap items-center gap-3 p-4">
              {imp.kind === 'text' ? (
                <ClipboardPaste className="size-5 shrink-0 text-slate-400" aria-hidden />
              ) : (
                <FileText className="size-5 shrink-0 text-slate-400" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{imp.fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {imp.kind === 'text' ? 'Text' : pluralize(imp.pageCount, 'page')} ·{' '}
                  {pluralize(imp.entries.length, 'entry', 'entries')} · {formatRelative(imp.updatedAt)}
                  {imp.usedOcr && ' · OCR'}
                </p>
              </div>
              {savedTitle ? (
                <Badge tone="green">Saved to “{savedTitle}”</Badge>
              ) : imp.savedSetId ? (
                <Badge tone="slate">Set deleted</Badge>
              ) : (
                <Badge tone="amber">
                  <TriangleAlert className="size-3" aria-hidden /> Not saved yet
                </Badge>
              )}
              <Link to={`/upload/${imp.id}`} className={buttonClass('secondary', 'sm')}>
                {imp.savedSetId ? 'Open review' : 'Continue review'}
              </Link>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete import ${imp.fileName}`} onClick={() => onDelete(imp)}>
                <Trash className="size-4" />
              </Button>
            </div>
          );
        })}
      </Panel>
    </section>
  );
}
