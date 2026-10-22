import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Library, Search } from 'lucide-react';
import { useAppData } from '../../state/AppData';
import { cn, pluralize } from '../../lib/utils';
import { searchSets } from '../../lib/search';

export function GlobalSearch() {
  const { sets } = useAppData();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => (query.trim() ? searchSets(sets, query).slice(0, 6) : []), [sets, query]);

  // "/" focuses search from anywhere (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key !== '/' || e.metaKey || e.ctrlKey) return;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
    navigate(path);
  };

  const submit = () => {
    const picked = results[active];
    if (picked) go(`/sets/${picked.set.id}`);
    else if (query.trim()) go(`/sets?q=${encodeURIComponent(query.trim())}`);
  };

  const showList = open && query.trim().length > 0;

  return (
    <div ref={rootRef} className="relative max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Search study sets"
        placeholder="Search sets and terms"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 sm:pr-10 text-sm text-slate-900 placeholder:text-slate-400 shadow-xs focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-slate-200 px-1.5 text-xs text-slate-400 sm:block dark:border-slate-700">
        /
      </kbd>
      {showList && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute inset-x-0 top-12 z-40 animate-fade-in overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        >
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-slate-500">No study sets match “{query.trim()}”.</p>
          ) : (
            results.map((r, i) => (
              <button
                key={r.set.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(`/sets/${r.set.id}`)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left',
                  i === active ? 'bg-slate-100 dark:bg-slate-800' : '',
                )}
              >
                <Library className="size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{r.set.title}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {pluralize(r.set.cards.length, 'card')}
                    {r.cardMatches > 0 && ` · ${pluralize(r.cardMatches, 'matching term')}`}
                  </span>
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => go(`/sets?q=${encodeURIComponent(query.trim())}`)}
            className="mt-1 w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-xs font-medium text-brand-700 hover:bg-slate-50 dark:border-slate-800 dark:text-brand-300 dark:hover:bg-slate-800"
          >
            See all results in My Study Sets
          </button>
        </div>
      )}
    </div>
  );
}
