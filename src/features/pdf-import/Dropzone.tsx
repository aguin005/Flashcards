import { useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { cn } from '../../lib/utils';

export function Dropzone({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label="Upload a PDF. Drop a file here or press Enter to browse."
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-testid="dropzone"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors',
        dragging
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
          : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500 dark:hover:bg-slate-800/60',
        disabled && 'pointer-events-none opacity-60',
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <FileUp className="size-7" aria-hidden />
      </div>
      <p className="text-base font-semibold text-slate-900 dark:text-white">
        {dragging ? 'Drop your PDF here' : 'Drag and drop a PDF, or click to browse'}
      </p>
      <p className="mt-1.5 max-w-md text-sm text-slate-500 dark:text-slate-400">
        Class notes, textbook chapters, vocabulary lists, or study guides. Text-based PDFs work best.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        data-testid="file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
