"use client";

import { startTransition, useOptimistic, useState } from "react";
import Link from "next/link";
import { STATUSES, STATUS_LABEL, daysUntil, isSchool, dueText, shortDate, toICS, type College, type Status, type Task } from "@/lib/college";
import {
    deleteCollege, deleteTask, saveCollege, saveTask, setCollegeStatus, setTaskDone,
    type CollegeFields, type TaskFields,
} from "@/app/profile/college-actions";

// Admin profile → College: every school's deadline and to-do list, what's due next, and a calendar export.
// Changes show at once and save in the background; the page refreshes itself from the database afterwards.

const input = "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2";
const primary = "rounded-full px-4 py-1.5 text-sm bg-black dark:bg-white text-white dark:text-black hover:opacity-80 disabled:opacity-50";
const secondary = "rounded-full px-4 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 hover:opacity-80 disabled:opacity-50";
const quiet = "text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";

type Update = (list: College[]) => College[];
const isTemp = (id: string) => id.startsWith("tmp-");

function DueChip({ date, today, done }: { date: string; today: string; done?: boolean }) {
    const n = daysUntil(date, today);
    const tone = done ? "bg-zinc-100 text-zinc-400 dark:bg-zinc-900"
        : n <= 3 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
            : n <= 7 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400";
    return (
        <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${tone}`}>
            {shortDate(date)}{done ? "" : ` · ${dueText(date, today)}`}
        </span>
    );
}

// Two clicks instead of confirm()
function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
    const [sure, setSure] = useState(false);
    return (
        <button type="button" className={`${quiet} ${sure ? "text-red-600 dark:text-red-400" : ""}`}
            onClick={() => { if (sure) onDelete(); else { setSure(true); setTimeout(() => setSure(false), 3000); } }}>
            {sure ? "Sure?" : label}
        </button>
    );
}

function TaskForm({ task, onSave, onCancel }: { task?: Task; onSave: (f: TaskFields) => void; onCancel: () => void }) {
    return (
        <form className="my-2 grid gap-2 sm:grid-cols-[1fr_10rem]"
            onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                onSave({ text: String(f.get("text")), due: String(f.get("due")), details: String(f.get("details")), link: String(f.get("link")) });
            }}>
            <input name="text" required maxLength={300} placeholder="What needs doing" defaultValue={task?.text} className={input} aria-label="Task" />
            <input name="due" type="date" defaultValue={task?.due} className={input} aria-label="Due date (blank: due with the school)" />
            <textarea name="details" rows={3} maxLength={5000} placeholder="Prompt, word limit, notes" defaultValue={task?.details}
                className={`${input} sm:col-span-2 resize-y text-sm`} aria-label="Details" />
            <input name="link" inputMode="url" placeholder="Link (e.g. the Google Doc draft)" defaultValue={task?.link} className={`${input} sm:col-span-2 text-sm`} aria-label="Link" />
            <div className="flex gap-2 sm:col-span-2">
                <button className={primary}>Save</button>
                <button type="button" className={secondary} onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

function SchoolForm({ college, onSave, onCancel }: { college?: College; onSave: (f: CollegeFields) => void; onCancel?: () => void }) {
    return (
        <form className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const get = (k: string) => String(f.get(k) ?? "");
                onSave({ name: get("name"), plan: get("plan"), deadline: get("deadline"), portal: get("portal"), link: get("link"), notes: get("notes") });
                if (!college) e.currentTarget.reset();
            }}>
            <label className="text-sm">College<input name="name" required maxLength={200} defaultValue={college?.name} placeholder="UC Berkeley" className={`${input} mt-1`} /></label>
            <label className="text-sm">Application plan<input name="plan" list="college-plans" maxLength={100} defaultValue={college?.plan} placeholder="Regular Decision" className={`${input} mt-1`} /></label>
            <label className="text-sm">Deadline<input name="deadline" type="date" defaultValue={college?.deadline} className={`${input} mt-1`} /></label>
            <label className="text-sm">Applies through<input name="portal" list="college-portals" maxLength={100} defaultValue={college?.portal} placeholder="Common App" className={`${input} mt-1`} /></label>
            <label className="text-sm sm:col-span-2">Link<input name="link" inputMode="url" defaultValue={college?.link} placeholder="Admissions or portal page" className={`${input} mt-1`} /></label>
            <label className="text-sm sm:col-span-2">Notes<textarea name="notes" rows={2} maxLength={5000} defaultValue={college?.notes} className={`${input} mt-1 resize-y`} /></label>
            <datalist id="college-plans"><option>Early Decision</option><option>Early Action</option><option>Restrictive Early Action</option><option>Regular Decision</option><option>UC application</option><option>Cal State Apply</option></datalist>
            <datalist id="college-portals"><option>Common App</option><option>UC application</option><option>Cal State Apply</option><option>College&apos;s own application</option></datalist>
            <div className="flex gap-2 sm:col-span-2">
                <button className={primary}>Save</button>
                {onCancel && <button type="button" className={secondary} onClick={onCancel}>Cancel</button>}
            </div>
        </form>
    );
}

function TaskRow({ task, today, onToggle, onSave, onDelete }: {
    task: Task; today: string; onToggle: () => void; onSave: (f: TaskFields) => void; onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    if (editing) return <li className="py-1"><TaskForm task={task} onSave={(f) => { onSave(f); setEditing(false); }} onCancel={() => setEditing(false)} /></li>;
    return (
        <li className="group flex gap-3 py-2">
            <input type="checkbox" checked={task.done} disabled={isTemp(task.id)} onChange={onToggle} id={`t-${task.id}`}
                className="mt-1 h-4 w-4 shrink-0 accent-black dark:accent-white" />
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label htmlFor={`t-${task.id}`} className={task.done ? "line-through text-zinc-400" : ""}>{task.text}</label>
                    {task.due && <DueChip date={task.due} today={today} done={task.done} />}
                    {task.link && <a href={task.link} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-2">open ↗</a>}
                </div>
                {task.details && (
                    <details className="mt-1 text-sm text-zinc-500">
                        <summary className="cursor-pointer select-none">Prompt &amp; notes</summary>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{task.details}</p>
                    </details>
                )}
            </div>
            {!isTemp(task.id) && (
                <div className="flex shrink-0 items-start gap-3 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <button type="button" className={quiet} onClick={() => setEditing(true)}>Edit</button>
                    <DeleteButton label="Delete" onDelete={onDelete} />
                </div>
            )}
        </li>
    );
}

function SchoolCard({ college: c, today, run }: { college: College; today: string; run: (u: Update, server: () => Promise<unknown>) => void }) {
    const [editing, setEditing] = useState(false);
    const [adding, setAdding] = useState(false);
    const done = c.tasks.filter((t) => t.done).length;
    const mapTasks = (fn: (tasks: Task[]) => Task[]): Update => (list) => list.map((x) => (x.id === c.id ? { ...x, tasks: fn(x.tasks) } : x));
    const temp = isTemp(c.id);

    if (editing) return (
        <li className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <SchoolForm college={c} onCancel={() => setEditing(false)} onSave={(f) => {
                setEditing(false);
                run((list) => list.map((x) => (x.id === c.id ? { ...x, ...f } : x)), () => saveCollege(c.id, f));
            }} />
        </li>
    );

    return (
        <li className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="text-xl font-bold">{c.name}</h3>
                    {(c.plan || c.portal) && <p className="text-sm text-zinc-500">{[...new Set([c.plan, c.portal].filter(Boolean))].join(" · ")}</p>}
                </div>
                {/* a group without a deadline (like "Every application") isn't an application, so it has no status */}
                {(c.deadline || c.status !== "applying") && <select aria-label={`${c.name} status`} value={c.status} disabled={temp}
                    onChange={(e) => {
                        const status = e.target.value as Status;
                        run((list) => list.map((x) => (x.id === c.id ? { ...x, status } : x)), () => setCollegeStatus(c.id, status));
                    }}
                    className="rounded-full border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-1 text-sm">
                    {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>}
            </div>
            {c.deadline && (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    Deadline <DueChip date={c.deadline} today={today} done={c.status !== "applying"} />
                </p>
            )}
            {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-500">{c.notes}</p>}

            {c.tasks.length > 0 && (<>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div className="h-full rounded-full bg-black dark:bg-white transition-[width]" style={{ width: `${(done / c.tasks.length) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-zinc-500">{done} of {c.tasks.length} done</p>
            </>)}
            <ul className="mt-2 divide-y divide-zinc-100 dark:divide-zinc-900">
                {c.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} today={today}
                        onToggle={() => run(mapTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x))), () => setTaskDone(c.id, t.id, !t.done))}
                        onSave={(f) => run(mapTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, ...f } : x))), () => saveTask(c.id, t.id, f))}
                        onDelete={() => run(mapTasks((ts) => ts.filter((x) => x.id !== t.id)), () => deleteTask(c.id, t.id))}
                    />
                ))}
            </ul>
            {adding && <TaskForm onCancel={() => setAdding(false)} onSave={(f) => {
                setAdding(false);
                run(mapTasks((ts) => [...ts, { ...f, id: `tmp-${Date.now()}`, done: false }]), () => saveTask(c.id, null, f));
            }} />}
            {!temp && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {!adding && <button type="button" className={quiet} onClick={() => setAdding(true)}>+ Add task</button>}
                    <button type="button" className={quiet} onClick={() => setEditing(true)}>Edit school</button>
                    {c.link && <a href={c.link} target="_blank" rel="noreferrer" className={quiet}>Portal ↗</a>}
                    <DeleteButton label="Delete school" onDelete={() => run((list) => list.filter((x) => x.id !== c.id), () => deleteCollege(c.id))} />
                </div>
            )}
        </li>
    );
}

export default function CollegeHub({ colleges, today, school }: { colleges: College[]; today: string; school?: string }) {
    const [list, apply] = useOptimistic(colleges, (state: College[], update: Update) => update(state));
    const [error, setError] = useState("");
    const [showAll, setShowAll] = useState(false);

    function run(update: Update, server: () => Promise<unknown>) {
        setError("");
        startTransition(async () => {
            apply(update);
            try { await server(); } catch { setError("Couldn't save that change. Refresh and try again."); }
        });
    }

    const tasks = list.flatMap((c) => c.tasks);
    const doneCount = tasks.filter((t) => t.done).length;
    const next = list
        .filter((c) => c.deadline && c.status === "applying" && daysUntil(c.deadline, today) >= 0)
        .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
    // every open task, soonest first; a task without its own date is due with its school
    const upcoming = list
        .flatMap((c) => c.tasks.filter((t) => !t.done).map((t) => ({ c, t, due: t.due || c.deadline || "" })))
        .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"));
    const shown = showAll ? upcoming : upcoming.slice(0, 6);

    function downloadICS() {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([toICS(list)], { type: "text/calendar" }));
        a.download = "college-deadlines.ics";
        a.click();
        URL.revokeObjectURL(a.href);
    }

    const stat = (big: string, small: string) => (
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
            <p className="text-2xl font-bold leading-tight">{big}</p>
            <p className="text-sm text-zinc-500">{small}</p>
        </div>
    );

    // One tab per college (the same ones listed under College in the profile sidebar); groups like
    // "Every application" stay on Overview. Tabs are links, so the address and the sidebar always match.
    const schools = list.filter((c) => isSchool(c) && !isTemp(c.id));
    const open = schools.find((c) => c.id === school);
    const href = (id: string) => (id ? `/profile?tab=college&school=${id}` : "/profile?tab=college");
    const tab = (id: string, label: React.ReactNode, active: boolean) => (
        <Link key={id || "overview"} href={href(id)} scroll={false} role="tab" aria-selected={active}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${active
                ? "border-black dark:border-white font-bold"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:hover:border-zinc-700 dark:hover:text-zinc-100"}`}>
            {label}
        </Link>
    );

    return (<>
        <h1 className="mt-10 mb-2 text-4xl font-bold">College</h1>
        <p className="mb-6 text-zinc-500">Every application, its deadline, and everything left to do for it.</p>

        <div role="tablist" aria-label="Colleges" className="mb-6 flex overflow-x-auto overflow-y-hidden border-b border-zinc-200 dark:border-zinc-800">
            {tab("", "Overview", !open)}
            {schools.map((c) => {
                const left = c.tasks.filter((t) => !t.done).length;
                return tab(c.id, (<>
                    {c.name}
                    <span className="ml-1.5 font-normal text-zinc-400">{left ? left : "✓"}</span>
                </>), open?.id === c.id);
            })}
        </div>
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {open ? (
            <ul role="tabpanel" aria-label={open.name}>
                <SchoolCard key={open.id} college={open} today={today} run={run} />
            </ul>
        ) : (<div role="tabpanel" aria-label="Overview">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stat(next ? dueText(next.deadline!, today) : "—", next ? `${next.name} deadline` : "No open deadlines")}
            {stat(`${doneCount} / ${tasks.length}`, "tasks done")}
            {stat(String(list.filter((c) => c.status !== "applying").length), `of ${list.filter((c) => c.deadline).length} applications submitted`)}
        </div>

        <h2 className="mt-10 mb-3 text-2xl font-bold">Up next</h2>
        {upcoming.length === 0 && <p className="text-zinc-500">Nothing left to do. 🎉</p>}
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {shown.map(({ c, t, due }) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                    <input type="checkbox" checked={false} disabled={isTemp(t.id)} id={`u-${t.id}`} aria-label={`Done: ${t.text}`}
                        onChange={() => run((l) => l.map((x) => (x.id === c.id ? { ...x, tasks: x.tasks.map((y) => (y.id === t.id ? { ...y, done: true } : y)) } : x)),
                            () => setTaskDone(c.id, t.id, true))}
                        className="h-4 w-4 shrink-0 accent-black dark:accent-white" />
                    <span className="flex-1 min-w-0">
                        <label htmlFor={`u-${t.id}`}>{t.text}</label>{" "}
                        {isSchool(c) && !isTemp(c.id)
                            ? <Link href={href(c.id)} scroll={false} className={quiet}>· {c.name}</Link>
                            : <span className="text-sm text-zinc-500">· {c.name}</span>}
                    </span>
                    {due && <DueChip date={due} today={today} />}
                </li>
            ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
            {upcoming.length > 6 && (
                <button type="button" className={quiet} onClick={() => setShowAll(!showAll)}>
                    {showAll ? "Show fewer" : `Show all ${upcoming.length}`}
                </button>
            )}
            <button type="button" className={quiet} onClick={downloadICS}>Download calendar file (.ics)</button>
        </div>

        <ul className="mt-10 flex flex-col gap-4">
            {list.filter((c) => !isSchool(c) || isTemp(c.id)).map((c) => <SchoolCard key={c.id} college={c} today={today} run={run} />)}
        </ul>

        <details className="mt-6 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-5">
            <summary className="cursor-pointer font-bold">+ Add a college</summary>
            <div className="mt-4">
                <SchoolForm onSave={(f) => run((l) => [...l, { ...f, id: `tmp-${Date.now()}`, status: "applying", tasks: [] }], () => saveCollege(null, f))} />
            </div>
        </details>
        </div>)}
    </>);
}
