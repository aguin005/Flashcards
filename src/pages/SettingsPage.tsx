import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Database, Download, FileText, HardDrive, Keyboard, ShieldCheck, Trash, Upload } from 'lucide-react';
import { useAppData, type ImportMode } from '../state/AppData';
import { estimateStorage, isStoragePersisted, requestPersistentStorage } from '../lib/db';
import { buildBackup, ImportError, parseImportText, type ParsedImport } from '../lib/export';
import { deleteFile, listFiles } from '../lib/imports';
import { setPrefs, usePrefs } from '../lib/storage';
import { downloadFile, errorMessage, formatBytes, formatDate, pluralize } from '../lib/utils';
import type { StoredFile, ThemePref } from '../types';
import { Button } from '../components/ui/Button';
import { Input, Kbd, Label, PageHeader, Panel, Segmented, Select } from '../components/ui/primitives';
import { Modal } from '../components/ui/Modal';
import { useConfirm, useToast } from '../components/ui/feedback';
import { pickFile } from '../features/sets/transfer';

function Section({ title, description, icon, children }: { title: string; description?: ReactNode; icon: ReactNode; children: ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 text-brand-600 dark:text-brand-400">{icon}</span>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

export default function SettingsPage() {
  const prefs = usePrefs();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sets, progress, sessions, importData, clearAll, persistent } = useAppData();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [files, setFiles] = useState<Omit<StoredFile, 'blob'>[]>([]);
  const [pending, setPending] = useState<ParsedImport | null>(null);
  const [goalInput, setGoalInput] = useState(String(prefs.dailyGoal));

  const refresh = useCallback(() => {
    void estimateStorage().then(setStorage);
    void isStoragePersisted().then(setPersisted);
    void listFiles()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, []);

  useEffect(refresh, [refresh, sets]);

  const exportAll = () => {
    const backup = buildBackup(sets, Object.values(progress), sessions);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadFile(`recall-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
    toast({ kind: 'success', title: 'Backup downloaded', description: `${pluralize(sets.length, 'set')} with progress and history.` });
  };

  const chooseImport = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      setPending(parseImportText(await file.text()));
    } catch (err) {
      toast({ kind: 'error', title: 'Import failed', description: err instanceof ImportError ? err.message : errorMessage(err) });
    }
  };

  const runImport = async (mode: ImportMode) => {
    if (!pending) return;
    if (mode === 'replace') {
      const ok = await confirm({
        title: 'Replace all study data?',
        message: `Your current ${pluralize(sets.length, 'set')}, progress, and history will be replaced by the backup.`,
        confirmLabel: 'Replace',
        danger: true,
      });
      if (!ok) return;
    }
    try {
      const { sets: n } = await importData(pending, mode);
      toast({ kind: 'success', title: `Imported ${pluralize(n, 'study set')}` });
      setPending(null);
    } catch (err) {
      toast({ kind: 'error', title: 'Import failed', description: errorMessage(err) });
    }
  };

  const clearEverything = async () => {
    const ok = await confirm({
      title: 'Delete all local data?',
      message: (
        <>
          This permanently deletes every study set, all progress and history, stored PDFs, import drafts, and your
          preferences from this browser. It cannot be undone. Export a backup first if you might want anything back.
        </>
      ),
      confirmLabel: 'Delete everything',
      danger: true,
      requireText: 'DELETE',
    });
    if (!ok) return;
    try {
      await clearAll();
      setGoalInput(String(20));
      refresh();
      toast({ kind: 'success', title: 'All local data deleted' });
    } catch (err) {
      toast({ kind: 'error', title: 'Could not clear data', description: errorMessage(err) });
    }
  };

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Section title="Appearance" icon={<span className="block size-5 rounded-full bg-gradient-to-br from-slate-200 to-slate-800" aria-hidden />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Theme</span>
            <Segmented<ThemePref>
              label="Theme"
              value={prefs.theme}
              onChange={(theme) => setPrefs({ theme })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' },
              ]}
            />
          </div>
        </Section>

        <Section title="Study preferences" icon={<Keyboard className="size-5" aria-hidden />}>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <Label htmlFor="goal">Daily goal (cards)</Label>
              <Input
                id="goal"
                type="number"
                min={1}
                max={500}
                value={goalInput}
                onChange={(e) => setGoalInput(e.target.value)}
                onBlur={() => {
                  const n = parseInt(goalInput, 10);
                  if (Number.isFinite(n) && n > 0) setPrefs({ dailyGoal: n });
                  setGoalInput(String(Number.isFinite(n) && n > 0 ? Math.min(500, n) : prefs.dailyGoal));
                }}
              />
            </div>
            <div>
              <Label htmlFor="front">Flashcards show first</Label>
              <Select id="front" value={prefs.flashcardFront} onChange={(e) => setPrefs({ flashcardFront: e.target.value as 'term' | 'definition' })}>
                <option value="term">Term</option>
                <option value="definition">Definition</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="pairs">Matching pairs per round</Label>
              <Select id="pairs" value={prefs.matchPairs} onChange={(e) => setPrefs({ matchPairs: Number(e.target.value) })}>
                {[4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            <p className="mb-2 font-medium text-slate-800 dark:text-slate-100">Keyboard shortcuts</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              <li><Kbd>/</Kbd> Search study sets</li>
              <li><Kbd>Space</Kbd> Flip a flashcard</li>
              <li><Kbd>←</Kbd> <Kbd>→</Kbd> Previous or next card</li>
              <li><Kbd>1</Kbd> <Kbd>2</Kbd> Still learning or know it (flashcards)</li>
              <li><Kbd>1</Kbd>–<Kbd>4</Kbd> Choose an answer (quiz)</li>
              <li><Kbd>Enter</Kbd> Submit or continue</li>
              <li><Kbd>S</Kbd> Star a card · <Kbd>F</Kbd> Full screen</li>
            </ul>
          </div>
        </Section>

        <Section
          title="Backup and restore"
          icon={<Database className="size-5" aria-hidden />}
          description="Browsers can clear site data (for example after clearing history, or to free space), so download a backup regularly."
        >
          <div className="flex flex-wrap gap-2">
            <Button onClick={exportAll} icon={<Download className="size-4" />} disabled={sets.length === 0} data-testid="export-all">
              Export all data
            </Button>
            <Button variant="secondary" onClick={chooseImport} icon={<Upload className="size-4" />} data-testid="import-backup">
              Import backup
            </Button>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            The backup is a JSON file with your sets, card progress, and session history. Stored PDF files are not included.
          </p>
        </Section>

        <Section title="Storage" icon={<HardDrive className="size-5" aria-hidden />}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Saved in</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{persistent ? 'IndexedDB (this browser)' : 'Memory only (not saved)'}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Space used</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {storage ? `${formatBytes(storage.usage)} of about ${formatBytes(storage.quota)}` : 'Unknown'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Protected from automatic cleanup</dt>
              <dd className="flex items-center gap-2 font-medium text-slate-900 dark:text-white">
                {persisted ? 'Yes' : 'No'}
                {!persisted && (
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300"
                    onClick={async () => {
                      const ok = await requestPersistentStorage();
                      setPersisted(ok);
                      toast({
                        kind: ok ? 'success' : 'info',
                        title: ok ? 'Storage is now protected' : 'The browser declined the request',
                        description: ok ? undefined : 'Some browsers only grant this to installed or frequently used sites. Keep exporting backups.',
                      });
                    }}
                  >
                    Request protection
                  </button>
                )}
              </dd>
            </div>
          </dl>

          <h3 className="mt-6 mb-2 text-sm font-semibold text-slate-900 dark:text-white">Stored PDFs</h3>
          {files.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No PDF files are stored.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <FileText className="size-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">{f.name}</span>
                    <span className="text-xs text-slate-500">
                      {formatBytes(f.size)} · {formatDate(f.createdAt)}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete stored file ${f.name}`}
                    onClick={async () => {
                      await deleteFile(f.id);
                      refresh();
                      toast({ kind: 'success', title: 'PDF removed', description: 'Study sets made from it are kept.' });
                    }}
                  >
                    <Trash className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 rounded-xl border border-rose-200 p-4 dark:border-rose-900">
            <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300">Delete all local data</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Removes every set, progress record, stored PDF, and preference from this browser.
            </p>
            <Button variant="danger" className="mt-3" onClick={clearEverything} icon={<Trash className="size-4" />} data-testid="clear-all">
              Delete all data
            </Button>
          </div>
        </Section>

        <Section title="Privacy" icon={<ShieldCheck className="size-5 text-emerald-600" aria-hidden />}>
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <p>
              Recall runs entirely in your browser. PDFs are read with PDF.js on your device and are never uploaded. There is
              no account, no server database, no analytics, and no tracking.
            </p>
            <p>
              Your sets, progress, and stored PDFs live in this browser’s IndexedDB; small preferences such as the theme and
              daily goal live in localStorage. Nothing leaves your device unless you export a file yourself.
            </p>
            <p>
              The optional OCR engine for scanned PDFs is downloaded from this same website the first time you use it; your
              document still stays on your device.
            </p>
            <p>
              Browser storage is not a permanent archive: clearing site data, private windows, or low disk space can remove
              it. Export a backup to keep a copy you control.
            </p>
          </div>
        </Section>
      </div>

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Import backup"
        description={
          pending
            ? `Found ${pluralize(pending.sets.length, 'study set')}, ${pluralize(pending.progress.length, 'progress record')}, and ${pluralize(pending.sessions.length, 'session')}.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => runImport('replace')} disabled={sets.length === 0}>
              Replace everything
            </Button>
            <Button onClick={() => runImport('merge')} data-testid="import-merge">
              Merge
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>
            <strong className="text-slate-900 dark:text-white">Merge</strong> adds the backup’s sets. Sets that already exist
            here (same set) are updated to the backup’s version.
          </li>
          <li>
            <strong className="text-slate-900 dark:text-white">Replace everything</strong> deletes your current sets, progress,
            and history first.
          </li>
        </ul>
      </Modal>
    </div>
  );
}
