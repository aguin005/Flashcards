import { Suspense, useMemo } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Settings, ShieldCheck, TriangleAlert } from 'lucide-react';
import { NAV_ITEMS } from './nav';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { useAppData } from '../../state/AppData';
import { dueCards } from '../../lib/stats';
import { cn } from '../../lib/utils';
import { Spinner } from '../ui/primitives';

function useDueCount(): number {
  const { sets, progress } = useAppData();
  return useMemo(() => dueCards(sets, progress).length, [sets, progress]);
}

function DueBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] leading-5 font-semibold text-white tabular-nums',
        className,
      )}
      aria-label={`${count} due`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function Sidebar() {
  const due = useDueCount();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
      <div className="flex h-16 items-center px-5">
        <Link to="/" className="rounded-lg" aria-label="Recall home">
          <Logo />
        </Link>
      </div>
      <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
              )
            }
          >
            <item.icon className="size-5 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.to === '/review' && <DueBadge count={due} />}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden /> Private by design
        </div>
        Your PDFs and study data stay in this browser. Export backups from{' '}
        <Link to="/settings" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
          Settings
        </Link>
        .
      </div>
    </aside>
  );
}

function MobileNav() {
  const due = useDueCount();
  const items = NAV_ITEMS.filter((i) => i.to !== '/settings');
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium',
                isActive ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400',
              )
            }
          >
            <item.icon className="size-5" aria-hidden />
            {item.short}
            {item.to === '/review' && <DueBadge count={due} className="absolute top-1 left-1/2 ml-2 text-[10px]" />}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="shrink-0 rounded-lg lg:hidden" aria-label="Recall home">
          <Logo compact />
        </Link>
        <div className="min-w-0 flex-1">
          <GlobalSearch />
        </div>
        <ThemeToggle />
        <NavLink
          to="/settings"
          aria-label="Settings"
          className="inline-flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Settings className="size-5" />
        </NavLink>
      </div>
    </header>
  );
}

export function StorageBanner() {
  const { persistent, loadError } = useAppData();
  if (loadError) {
    return (
      <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Your saved data could not be loaded.</p>
          <p className="mt-0.5">{loadError} Try reloading the page. If the problem continues, check that site data is allowed for this page.</p>
        </div>
      </div>
    );
  }
  if (!persistent) {
    return (
      <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">Browser storage is unavailable.</p>
          <p className="mt-0.5">
            This browser (or a private window) blocked IndexedDB, so anything you create will be lost when you close the tab.
            Export a backup from Settings before leaving.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

export function AppLayout() {
  const { ready } = useAppData();
  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="lg:pl-64">
        <TopBar />
        <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pb-12">
          <StorageBanner />
          {ready ? (
            <Suspense
              fallback={
                <div className="flex justify-center py-24">
                  <Spinner />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          ) : (
            <div className="flex justify-center py-24">
              <Spinner label="Loading your study data" />
            </div>
          )}
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
