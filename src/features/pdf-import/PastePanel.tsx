import { useDeferredValue, useMemo } from 'react';
import { ArrowRight, ClipboardPaste, FileText, X } from 'lucide-react';
import { parsePastedText, PASTE_FORMATS, type PasteFormat } from '../../lib/paste-parser';
import type { ExtractionResult } from '../../lib/vocabulary-extractor';
import { pluralize } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Input, Label, Panel, Select, Textarea } from '../../components/ui/primitives';

const PLACEHOLDER = `Paste notes or a vocabulary list, for example:

Osmosis: the diffusion of water across a membrane
Enzyme - a protein that speeds up reactions
ATP	the energy currency of the cell`;

export interface PasteState {
  text: string;
  format: PasteFormat;
  separator: string;
  /** Name of a loaded .txt/.csv file, if the text came from one. */
  fileName?: string;
}

export function PastePanel({
  state,
  onChange,
  onPasteFromClipboard,
  onOpenFile,
  onContinue,
  busy,
}: {
  state: PasteState;
  onChange: (patch: Partial<PasteState>) => void;
  onPasteFromClipboard?: () => void;
  onOpenFile: () => void;
  onContinue: (result: ExtractionResult) => void;
  busy?: boolean;
}) {
  const deferredText = useDeferredValue(state.text);
  const result = useMemo(
    () => parsePastedText(deferredText, { format: state.format, separator: state.separator }),
    [deferredText, state.format, state.separator],
  );
  const selected = result.entries.filter((e) => e.selected).length;
  const toReview = result.entries.length - selected;
  const hasText = state.text.trim().length > 0;
  const formatInfo = PASTE_FORMATS.find((f) => f.value === state.format);

  return (
    <Panel className="p-4 sm:p-6" data-testid="paste-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor="paste-input" className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {state.fileName ? (
            <span className="inline-flex items-center gap-1.5">
              <FileText className="size-4 text-slate-400" aria-hidden /> {state.fileName}
            </span>
          ) : (
            'Paste your notes or vocabulary list'
          )}
        </label>
        <div className="flex flex-wrap gap-2">
          {onPasteFromClipboard && (
            <Button variant="secondary" size="sm" icon={<ClipboardPaste className="size-4" />} onClick={onPasteFromClipboard}>
              Paste from clipboard
            </Button>
          )}
          <Button variant="secondary" size="sm" icon={<FileText className="size-4" />} onClick={onOpenFile}>
            Open .txt or .csv
          </Button>
        </div>
      </div>

      <div className="relative mt-3">
        <Textarea
          id="paste-input"
          value={state.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          className="min-h-52 resize-y font-mono leading-relaxed sm:min-h-64"
          data-testid="paste-input"
        />
        {hasText && (
          <button
            type="button"
            onClick={() => onChange({ text: '', fileName: undefined })}
            aria-label="Clear pasted text"
            className="absolute top-2 right-2 inline-flex size-9 items-center justify-center rounded-lg bg-white/90 text-slate-500 hover:text-slate-900 dark:bg-slate-900/90 dark:hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
        <div>
          <Label htmlFor="paste-format">Format</Label>
          <Select
            id="paste-format"
            value={state.format}
            onChange={(e) => onChange({ format: e.target.value as PasteFormat })}
            data-testid="paste-format"
          >
            {PASTE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          {formatInfo && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{formatInfo.hint}</p>}
        </div>
        {state.format === 'custom' && (
          <div>
            <Label htmlFor="paste-separator">Separator</Label>
            <Input
              id="paste-separator"
              value={state.separator}
              onChange={(e) => onChange({ separator: e.target.value })}
              placeholder="e.g.  =  or  |"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        )}
      </div>

      {hasText && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50" aria-live="polite" data-testid="paste-preview">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {result.entries.length === 0
              ? 'No terms detected yet. Try another format, or continue and add them by hand.'
              : `${pluralize(result.entries.length, 'term')} detected${toReview ? `, ${toReview} to check` : ''}`}
          </p>
          {result.entries.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {result.entries.slice(0, 4).map((e) => (
                <li key={e.id} className="flex min-w-0 gap-2">
                  <span className="max-w-[40%] shrink-0 truncate font-medium text-slate-900 dark:text-white">{e.term}</span>
                  <span className="truncate text-slate-600 dark:text-slate-400">
                    {e.definition || <em className="text-rose-600 dark:text-rose-400">no definition</em>}
                  </span>
                </li>
              ))}
              {result.entries.length > 4 && (
                <li className="text-xs text-slate-500 dark:text-slate-400">and {result.entries.length - 4} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button
          size="lg"
          disabled={!hasText || busy}
          loading={busy}
          onClick={() => onContinue(parsePastedText(state.text, { format: state.format, separator: state.separator }))}
          className="w-full sm:w-auto"
          data-testid="paste-continue"
        >
          {result.entries.length ? `Review ${pluralize(result.entries.length, 'term')}` : 'Continue'} <ArrowRight className="size-4" />
        </Button>
      </div>
    </Panel>
  );
}
