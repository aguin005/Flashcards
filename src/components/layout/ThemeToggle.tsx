import { Monitor, Moon, Sun } from 'lucide-react';
import { setPrefs, usePrefs } from '../../lib/storage';
import type { ThemePref } from '../../types';

const ORDER: ThemePref[] = ['light', 'dark', 'system'];
const LABELS: Record<ThemePref, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function ThemeToggle() {
  const { theme } = usePrefs();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      type="button"
      onClick={() => setPrefs({ theme: next })}
      aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next]}.`}
      title={`Theme: ${LABELS[theme]}`}
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon className="size-5" />
    </button>
  );
}
