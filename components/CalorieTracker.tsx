"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { startTransition, useEffect, useOptimistic, useRef, useState } from "react";
import NumberFlow from "@number-flow/react";
import { addFoodEntry, deleteFoodEntry, setSupplementTaken } from "@/app/calories/actions";
import { DAILY_GOAL, PROTEIN_GOAL, QUICK_FOODS, SUPPLEMENTS, dayLabel, shiftDay, type FoodEntry, type QuickFood, type SupplementId } from "@/lib/calories";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { Grid } from "@/components/charts/grid";
import { XAxis } from "@/components/charts/x-axis";
import { ChartTooltip } from "@/components/charts/tooltip";

// /calories: log what was eaten on one day and see it against the daily goal.
// Like the shopping list, changes show at once and save in the background.

// the scanner (and its barcode library) only downloads once Scan is tapped
const BarcodeScanner = dynamic(() => import("./BarcodeScanner"), { ssr: false });

// Bklit's chart reveal (components/charts/area-chart.tsx): 1100 ms on this curve.
// The goal bar uses the same so it fills up alongside the chart, and again whenever food is added.
const FILL = "1100ms cubic-bezier(0.85, 0, 0.15, 1)";

// A goal bar: starts empty, then fills to its value after the first paint and slides whenever it changes.
// `overIsBad` turns it red past the goal (calories); protein past its goal is fine.
function GoalBar({ value, goal, label, overIsBad = false, thin = false }: { value: number; goal: number; label: string; overIsBad?: boolean; thin?: boolean }) {
    const [shown, setShown] = useState(0);
    useEffect(() => {
        const frame = requestAnimationFrame(() => setShown(value));
        return () => cancelAnimationFrame(frame);
    }, [value]);
    const red = overIsBad && value > goal;
    return (
        <div className={`${thin ? "h-1.5" : "h-2"} overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value}>
            <div className={`h-full rounded-full motion-reduce:!transition-none ${red ? "bg-red-500" : "bg-zinc-900 dark:bg-zinc-100"}`}
                style={{ width: `${Math.min(100, (shown / goal) * 100)}%`, transition: `width ${FILL}, background-color 300ms` }} />
        </div>
    );
}

// The round checkbox from the shopping list: an empty ring, a faint check on hover, filled once checked
function Check({ checked }: { checked: boolean }) {
    return (
        <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${checked
            ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-black"
            : "border-zinc-400 text-transparent group-hover:text-zinc-400 dark:border-zinc-600 dark:group-hover:text-zinc-600"}`}>
            <svg viewBox="0 0 16 16" className="h-3 w-3">
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </span>
    );
}

const sectionHead = "mb-1 flex items-baseline justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1 text-sm font-bold text-zinc-500";

type Update = (list: FoodEntry[]) => FoodEntry[];
const isTemp = (id: string) => id.startsWith("tmp-");
const quiet = "text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";
const field = "min-w-0 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400";

function DayArrow({ to, label, path }: { to: string | null; label: string; path: string }) {
    const look = "flex h-7 w-7 items-center justify-center rounded-full";
    const icon = (
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d={path} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
    return to === null
        ? <span aria-hidden className={`${look} text-zinc-300 dark:text-zinc-700`}>{icon}</span>
        : <Link href={`/calories?day=${to}`} aria-label={label} className={`${look} text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100`}>{icon}</Link>;
}

export default function CalorieTracker({ day, today, entries, week, taken, recents }: {
    day: string; today: string; entries: FoodEntry[]; week: { day: string; calories: number }[]; taken: string[]; recents: QuickFood[];
}) {
    const [list, apply] = useOptimistic(entries, (state: FoodEntry[], update: Update) => update(state));
    const [vitamins, setVitamins] = useOptimistic(taken, (state: string[], next: string[]) => next);
    const [error, setError] = useState("");
    const [scanning, setScanning] = useState(false);
    const form = useRef<HTMLFormElement>(null);

    function run(update: Update, server: () => Promise<unknown>) {
        setError("");
        startTransition(async () => {
            apply(update);
            try { await server(); } catch { setError("Couldn't save that change. Refresh and try again."); }
        });
    }

    function toggleVitamin(id: SupplementId) {
        const on = !vitamins.includes(id);
        setError("");
        startTransition(async () => {
            setVitamins(on ? [...vitamins, id] : vitamins.filter((v) => v !== id));
            try { await setSupplementTaken(day, id, on); } catch { setError("Couldn't save that change. Refresh and try again."); }
        });
    }

    function add(name: string, calories: number, protein?: number) {
        run((l) => [...l, { id: `tmp-${Date.now()}`, name, calories, protein, createdAt: Date.now() }],
            () => addFoodEntry(day, name, calories, protein));
    }

    const total = list.reduce((sum, e) => sum + e.calories, 0);
    const protein = list.reduce((sum, e) => sum + (e.protein ?? 0), 0);
    const left = DAILY_GOAL - total;
    // the shown day's point follows unsaved changes too; "goal" draws the dashed goal line
    const chartData = week.map((w) => {
        const [y, m, d] = w.day.split("-").map(Number);
        return { date: new Date(y, m - 1, d), calories: w.day === day ? total : w.calories, goal: DAILY_GOAL };
    });
    const weekdays = week.map((w) => new Date(`${w.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }));

    return (
        <main className="flex-1 px-4 pb-10">
            <div className="max-w-2xl mx-auto">
                <div className="mt-10 mb-6 flex items-center justify-between">
                    <h1 className="text-4xl font-bold">{dayLabel(day, today)}</h1>
                    <div className="flex items-center gap-1">
                        <DayArrow to={shiftDay(day, -1)} label="Previous day" path="M10 3 5 8l5 5" />
                        <DayArrow to={day < today ? shiftDay(day, 1) : null} label="Next day" path="M6 3l5 5-5 5" />
                    </div>
                </div>

                {/* total against the goal */}
                <div className="mb-2 flex items-baseline justify-between gap-4">
                    <p><NumberFlow value={total} className="text-3xl font-bold tabular-nums" /> <span className="text-zinc-500">/ {DAILY_GOAL.toLocaleString()} kcal</span></p>
                    <p className={`text-sm tabular-nums ${left < 0 ? "text-red-600 dark:text-red-400" : "text-zinc-500"}`}>
                        {left >= 0 ? `${left.toLocaleString()} left` : `${(-left).toLocaleString()} over`}
                    </p>
                </div>
                <GoalBar value={total} goal={DAILY_GOAL} label="Calories" overIsBad />

                {/* protein against its goal */}
                <div className="mt-4 mb-1.5 flex items-baseline justify-between gap-4 text-sm">
                    <p><span className="font-bold">Protein</span> <NumberFlow value={protein} className="tabular-nums" /> <span className="text-zinc-500">/ {PROTEIN_GOAL} g</span></p>
                    <p className="text-zinc-500 tabular-nums">{protein >= PROTEIN_GOAL ? "Goal hit" : `${PROTEIN_GOAL - protein} g to go`}</p>
                </div>
                <GoalBar value={protein} goal={PROTEIN_GOAL} label="Protein" thin />

                {/* the daily vitamin checkoff */}
                <div className="mt-5 mb-8 flex flex-wrap gap-2">
                    {SUPPLEMENTS.map((s) => {
                        const on = vitamins.includes(s.id);
                        return (
                            <button key={s.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggleVitamin(s.id)} title={`Take ${s.when}`}
                                className="group flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 py-1 pl-1.5 pr-3 text-sm hover:border-zinc-400 dark:hover:border-zinc-600">
                                <Check checked={on} />
                                <span className={on ? "text-zinc-400 line-through" : ""}>{s.name}</span>
                            </button>
                        );
                    })}
                </div>

                {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

                <form ref={form} className="flex flex-wrap gap-2"
                    onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
                        e.preventDefault();
                        const data = new FormData(e.currentTarget);
                        const name = String(data.get("name")).trim();
                        const calories = Number(data.get("calories"));
                        const p = String(data.get("protein")).trim();
                        if (!name || !(calories >= 0)) return;
                        form.current!.reset();
                        form.current!.querySelector<HTMLInputElement>("[name=name]")!.focus();
                        add(name, Math.round(calories), p ? Math.round(Number(p)) : undefined);
                    }}>
                    <input name="name" required maxLength={120} placeholder="Food" aria-label="Food" autoComplete="off" className={`${field} flex-1 basis-48`} />
                    <input name="calories" required type="number" min={0} max={10000} inputMode="numeric" placeholder="kcal" aria-label="Calories" className={`${field} w-24`} />
                    <input name="protein" type="number" min={0} max={1000} inputMode="numeric" placeholder="Protein g" aria-label="Protein in grams" className={`${field} w-28`} />
                    <button type="submit" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300">Add</button>
                    <button type="button" onClick={() => setScanning((s) => !s)} aria-expanded={scanning} aria-label="Scan a barcode"
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${scanning
                            ? "border-zinc-900 dark:border-zinc-100"
                            : "border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-600"}`}>
                        {/* barcode glyph */}
                        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                            <path d="M2 3v10M4.5 3v10M6 3v10M8.5 3v10M11 3v10M12.5 3v10M14 3v10" fill="none" stroke="currentColor" strokeWidth="1.1" />
                        </svg>
                        Scan
                    </button>
                </form>
                {scanning && <BarcodeScanner onAdd={add} onClose={() => setScanning(false)} />}

                {/* what was eaten on the shown day */}
                <section className="mt-8">
                <h2 className={sectionHead}>
                    <span>{day === today ? "Eaten today" : "Eaten"}</span>
                    <span className="font-normal tabular-nums">{list.length} {list.length === 1 ? "item" : "items"}</span>
                </h2>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {list.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">Nothing logged yet.</li>}
                    {list.map((e) => (
                        <li key={e.id} className={`group flex items-center gap-3 py-2.5 ${isTemp(e.id) ? "opacity-60" : ""}`}>
                            <span className="flex-1 min-w-0 break-words">{e.name}</span>
                            {e.protein !== undefined && <span className="text-xs text-zinc-400 tabular-nums">{e.protein} g</span>}
                            <span className="w-16 text-right tabular-nums">{e.calories}</span>
                            <button type="button" aria-label={`Delete ${e.name}`} disabled={isTemp(e.id)}
                                onClick={() => run((l) => l.filter((x) => x.id !== e.id), () => deleteFoodEntry(e.id))}
                                className={`${quiet} w-6 shrink-0 text-center text-lg leading-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 ${isTemp(e.id) ? "invisible" : ""}`}>
                                ×
                            </button>
                        </li>
                    ))}
                </ul>
                </section>

                {/* foods logged before, newest first: tap to log again. Starter foods until there's history. */}
                <section className="mt-8">
                    <h2 className={sectionHead}>
                        <span>{recents.length ? "Recents" : "Suggestions"}</span>
                        <span className="font-normal">tap to add</span>
                    </h2>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                        {(recents.length ? recents : QUICK_FOODS).map((f) => (
                            <li key={f.name}>
                                <button type="button" onClick={() => add(f.name, f.calories, f.protein)} aria-label={`Add ${f.name}`}
                                    className="group flex w-full items-center gap-3 py-2 text-left text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100">
                                    <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 text-sm leading-none group-hover:border-zinc-500">+</span>
                                    <span className="flex-1 min-w-0 truncate">{f.name}</span>
                                    {f.protein !== undefined && <span className="text-xs text-zinc-400 tabular-nums">{f.protein} g</span>}
                                    <span className="w-16 text-right tabular-nums">{f.calories}</span>
                                    <span aria-hidden className="w-6 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* the seven days ending on the shown day (Bklit area chart); the dashed line is the goal */}
                <section className="mt-12">
                    <h2 className="mb-3 text-sm font-bold text-zinc-500">Last 7 days</h2>
                    <AreaChart data={chartData} aspectRatio="3 / 1" margin={{ top: 16, right: 12, bottom: 32, left: 12 }}>
                        <Grid horizontal numTicksRows={4} />
                        <Area dataKey="goal" fillOpacity={0} stroke="var(--chart-foreground-muted)" strokeWidth={1} dashFromIndex={0} dashArray="4,4" showHighlight={false} />
                        <Area dataKey="calories" fill="var(--chart-line-primary)" fillOpacity={0.3} strokeWidth={2} showMarkers />
                        <XAxis tickMode="data" numTicks={7} labels={weekdays} />
                        <ChartTooltip dateLabels={weekdays}
                            rows={(p) => [{ color: "var(--chart-line-primary)", label: "Calories", value: `${Number(p.calories).toLocaleString()} kcal` }]} />
                    </AreaChart>
                </section>
            </div>
        </main>
    );
}
