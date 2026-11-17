"use client";

import { useState } from "react";

// Visitors and page views per day as two smooth areas that draw in from the left, with a hover crosshair.
// The SVG stretches to its box (non-scaling strokes); text and the tooltip are HTML so they never stretch.
type Day = { day: string; visitors: number; views: number };
const W = 1000, H = 300;
const SERIES = [
  { key: "views", label: "Page views", color: "var(--bk-accent)", fill: 0.12 },
  { key: "visitors", label: "Visitors", color: "var(--bk-blue)", fill: 0.35 },
] as const;

// Horizontal tangents at every point: smooth, and never overshoots below zero
const curve = (pts: [number, number][]) =>
  pts.map(([x, y], i) => {
    if (!i) return `M${x},${y}`;
    const [px, py] = pts[i - 1], mx = (px + x) / 2;
    return `C${mx},${py} ${mx},${y} ${x},${y}`;
  }).join("");

const short = (day: string) => new Date(day + "T00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function VisitsChart({ data }: { data: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const raw = Math.max(1, ...data.map((d) => d.views));
  // 4 gridline steps of 1, 2 or 5 × 10ⁿ, so every axis label is a round number
  const p = 10 ** Math.floor(Math.log10(raw / 4)), tick = Math.max(1, [1, 2, 5, 10].find((k) => k * p >= raw / 4)! * p), max = tick * 4;
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  const h = hover !== null ? data[hover] : null;

  return (
    <div className="flex h-full min-h-48 flex-col">
      <div className="mb-3 flex items-center gap-4 text-xs text-(--bk-mute)">
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
        ))}
      </div>
      <div className="relative flex-1 pl-8 pb-5">
        {/* y axis: 4 recessive gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <div key={t} className="absolute left-8 right-0 border-t border-(--bk-line)/60" style={{ bottom: `calc(${t} * (100% - 1.25rem) + 1.25rem)` }}>
            <span className="absolute -left-8 -top-2 w-6 text-right text-[10px] tabular-nums text-(--bk-mute)">{Math.round(max * t)}</span>
          </div>
        ))}
        <div className="relative h-full"
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))); }}
          onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img"
            aria-label={`Visitors and page views per day, last ${data.length} days`}>
            <defs>
              <clipPath id="bk-clip"><rect className="bk-reveal" x="0" y="-10" width={W} height={H + 20} /></clipPath>
              {SERIES.map((s) => (
                <linearGradient key={s.key} id={`bk-g-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={s.color} stopOpacity={s.fill} />
                  <stop offset="1" stopColor={s.color} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
            <g clipPath="url(#bk-clip)">
              {SERIES.map((s) => {
                const line = curve(data.map((d, i) => [x(i), y(d[s.key])]));
                return (
                  <g key={s.key}>
                    <path d={`${line}L${W},${H}L0,${H}Z`} fill={`url(#bk-g-${s.key})`} />
                    <path d={line} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                  </g>
                );
              })}
            </g>
          </svg>
          {h && (<>
            <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-(--bk-mute)/60" style={{ left: `${(x(hover!) / W) * 100}%` }} />
            {SERIES.map((s) => (
              <div key={s.key} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full ring-2 ring-(--bk-panel)"
                style={{ left: `${(x(hover!) / W) * 100}%`, bottom: `${(h[s.key] / max) * 100}%`, background: s.color }} />
            ))}
            <div className={`pointer-events-none absolute top-0 z-10 rounded-lg border border-(--bk-line) bg-(--bk-raised) px-3 py-2 text-xs shadow-lg ${hover! > data.length / 2 ? "-translate-x-[calc(100%+12px)]" : "translate-x-3"}`}
              style={{ left: `${(x(hover!) / W) * 100}%` }}>
              <p className="mb-1 text-(--bk-mute)">{short(h.day)}</p>
              {[...SERIES].reverse().map((s) => (
                <p key={s.key} className="flex items-center gap-2 whitespace-nowrap">
                  <i className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}<b className="ml-auto pl-3 tabular-nums">{h[s.key]}</b>
                </p>
              ))}
            </div>
          </>)}
        </div>
        {/* x axis: first, middle and last day */}
        <div className="absolute bottom-0 left-8 right-0 flex justify-between text-[10px] text-(--bk-mute)">
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) => <span key={i}>{short(data[i].day)}</span>)}
        </div>
      </div>
    </div>
  );
}
