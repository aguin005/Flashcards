export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-8 shrink-0" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#4a49f0" />
        <rect x="14" y="20" width="30" height="22" rx="4" fill="#c6ceff" />
        <rect x="20" y="14" width="30" height="22" rx="4" fill="#ffffff" />
        <path d="M27 25h16M27 30h10" stroke="#4a49f0" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {!compact && <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">Recall</span>}
    </span>
  );
}
