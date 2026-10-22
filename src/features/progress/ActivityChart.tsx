import { useLayoutEffect, useRef, useState } from 'react';
import type { DayActivity } from '../../lib/stats';
import { cn } from '../../lib/utils';

/**
 * Cards reviewed per day. One series, so one color and no legend box: the
 * section title names what is plotted. Every bar is a hover/focus target, and
 * the same numbers are available in the table view.
 */

const PLOT_HEIGHT = 180;
const X_AXIS = 26;
const LEFT = 32;
const TOP = 18;
const MAX_BAR = 24;

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = Math.ceil(value / (step * pow)) * step * pow;
    if (candidate / value < 1.6) return candidate;
  }
  return Math.ceil(value / pow) * pow;
}

function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K` : String(n);
}

const fullDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function barPath(x: number, y: number, w: number, h: number): string {
  // 4px rounded data-end at the top, square at the baseline.
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export function ActivityChart({ data, goal }: { data: DayActivity[]; goal?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(240, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const maxValue = Math.max(...data.map((d) => d.answers), goal ?? 0, 1);
  const yMax = niceMax(maxValue);
  const ticks = [0, yMax / 4, yMax / 2, (yMax * 3) / 4, yMax].map((t) => Math.round(t));
  const plotW = width - LEFT - 8;
  const band = plotW / data.length;
  const barW = Math.max(3, Math.min(MAX_BAR, band * 0.6));
  const y = (v: number) => TOP + PLOT_HEIGHT - (v / yMax) * PLOT_HEIGHT;
  const labelEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : 5;
  const todayIndex = data.length - 1;
  const activeDay = active !== null ? data[active] : null;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width={width}
        height={TOP + PLOT_HEIGHT + X_AXIS}
        role="group"
        aria-label={`Cards reviewed per day, last ${data.length} days`}
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={LEFT} x2={width - 8} y1={y(t)} y2={y(t)} className="stroke-chart-grid" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={LEFT - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums dark:fill-slate-400">
              {compact(t)}
            </text>
          </g>
        ))}
        {goal && goal <= yMax && (
          <g aria-hidden>
            <line x1={LEFT} x2={width - 8} y1={y(goal)} y2={y(goal)} className="stroke-slate-400 dark:stroke-slate-500" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={width - 8} y={y(goal) - 5} textAnchor="end" className="fill-slate-500 text-[11px] dark:fill-slate-400">
              Daily goal {goal}
            </text>
          </g>
        )}
        {data.map((d, i) => {
          const cx = LEFT + band * i + band / 2;
          const h = Math.max(0, TOP + PLOT_HEIGHT - y(d.answers));
          const label = `${fullDate(d.date)}: ${d.answers} cards reviewed${d.answers ? `, ${Math.round((d.correct / d.answers) * 100)}% correct` : ''}`;
          return (
            <g
              key={d.key}
              tabIndex={0}
              role="img"
              aria-label={label}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive((a) => (a === i ? null : a))}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              className="outline-none"
            >
              {/* Hit target: the whole band, taller than the mark. */}
              <rect x={LEFT + band * i} y={TOP} width={band} height={PLOT_HEIGHT} fill="transparent" />
              {h > 0 && (
                <path
                  d={barPath(cx - barW / 2, TOP + PLOT_HEIGHT - h, barW, h)}
                  className={cn('fill-chart-bar transition-opacity', active !== null && active !== i && 'opacity-60')}
                />
              )}
              {i === todayIndex && d.answers > 0 && (
                <text x={cx} y={TOP + PLOT_HEIGHT - h - 6} textAnchor="middle" className="fill-slate-700 text-[11px] font-semibold tabular-nums dark:fill-slate-200">
                  {d.answers}
                </text>
              )}
              {(i === todayIndex || (i % labelEvery === 0 && todayIndex - i >= labelEvery)) && (
                <text x={cx} y={TOP + PLOT_HEIGHT + 17} textAnchor="middle" className="fill-slate-500 text-[11px] dark:fill-slate-400">
                  {i === todayIndex
                    ? 'Today'
                    : data.length <= 7
                      ? new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })
                      : new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </text>
              )}
              {active === i && (
                <rect
                  x={LEFT + band * i + 1}
                  y={TOP}
                  width={band - 2}
                  height={PLOT_HEIGHT}
                  rx={6}
                  className="fill-slate-500/5 dark:fill-white/5"
                  pointerEvents="none"
                />
              )}
            </g>
          );
        })}
        <line
          x1={LEFT}
          x2={width - 8}
          y1={TOP + PLOT_HEIGHT}
          y2={TOP + PLOT_HEIGHT}
          className="stroke-slate-300 dark:stroke-slate-700"
          strokeWidth={1}
          shapeRendering="crispEdges"
        />
      </svg>
      {activeDay && active !== null && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
          style={{
            left: Math.min(Math.max(LEFT + band * active + band / 2, 80), width - 80),
            top: Math.max(0, y(activeDay.answers) - 62),
          }}
        >
          <div className="text-base font-semibold text-slate-900 tabular-nums dark:text-white">
            {activeDay.answers} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">cards</span>
          </div>
          <div className="text-slate-600 dark:text-slate-300">{fullDate(activeDay.date)}</div>
          {activeDay.answers > 0 && (
            <div className="text-slate-500 dark:text-slate-400">
              {Math.round((activeDay.correct / activeDay.answers) * 100)}% correct · {activeDay.sessions}{' '}
              {activeDay.sessions === 1 ? 'session' : 'sessions'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActivityTable({ data }: { data: DayActivity[] }) {
  return (
    <div className="scroll-thin max-h-72 overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-white text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Date</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Cards reviewed</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Correct</th>
            <th scope="col" className="py-2 text-right font-medium">Accuracy</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums dark:divide-slate-800">
          {[...data].reverse().map((d) => (
            <tr key={d.key} className="text-slate-700 dark:text-slate-300">
              <td className="py-1.5 pr-4">{fullDate(d.date)}</td>
              <td className="py-1.5 pr-4 text-right">{d.answers}</td>
              <td className="py-1.5 pr-4 text-right">{d.correct}</td>
              <td className="py-1.5 text-right">{d.answers ? `${Math.round((d.correct / d.answers) * 100)}%` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
