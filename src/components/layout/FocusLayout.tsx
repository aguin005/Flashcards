import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Layers, ListChecks, Maximize2, Minimize2, PenLine, Puzzle, X } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '../../lib/utils';

const MODES = [
  { mode: 'flashcards', label: 'Flashcards', icon: Layers },
  { mode: 'quiz', label: 'Quiz', icon: ListChecks },
  { mode: 'written', label: 'Written', icon: PenLine },
  { mode: 'match', label: 'Match', icon: Puzzle },
];

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen?.();
  else void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** Distraction-free layout for study modes: no sidebar, just the essentials. */
export function FocusLayout({ title, backTo, children }: { title: string; backTo: string; children: ReactNode }) {
  const { search } = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 sm:px-6">
          <Link
            to={backTo}
            aria-label="Exit study mode"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="size-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 sm:text-base dark:text-white">{title}</h1>
          <nav aria-label="Study modes" className="hidden items-center gap-1 rounded-xl bg-slate-100 p-1 sm:flex dark:bg-slate-800">
            {MODES.map(({ mode, label, icon: Icon }) => (
              <NavLink
                key={mode}
                to={`/study/${mode}${search}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
                  )
                }
              >
                <Icon className="size-3.5" aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
            title={isFullscreen ? 'Exit full screen (F)' : 'Full screen (F)'}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {isFullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
          </button>
          <ThemeToggle />
        </div>
        <nav aria-label="Study modes" className="flex justify-center gap-1 px-3 pb-2 sm:hidden">
          {MODES.map(({ mode, label, icon: Icon }) => (
            <NavLink
              key={mode}
              to={`/study/${mode}${search}`}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium',
                  isActive ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400',
                )
              }
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">{children}</main>
    </div>
  );
}
