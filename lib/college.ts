// College app tracker on the admin profile (?tab=college): shapes and date helpers shared by the server and the page.
// The data itself lives in MongoDB (lib/CollegeModel.ts); the first visit fills it from lib/collegeSeed.ts.

export const STATUSES = ["applying", "submitted", "admitted", "waitlisted", "rejected"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<Status, string> = {
    applying: "Applying",
    submitted: "Submitted",
    admitted: "Admitted",
    waitlisted: "Waitlisted",
    rejected: "Rejected",
};

export type Task = {
    id: string;
    text: string;
    due?: string; // YYYY-MM-DD; without one the task is due with its school
    done: boolean;
    details?: string; // essay prompt, word limit, notes
    link?: string; // e.g. the Google Doc with the draft
};

export type College = {
    id: string;
    name: string;
    plan?: string; // Regular Decision, UC application...
    deadline?: string; // YYYY-MM-DD
    portal?: string; // Common App, UC application...
    status: Status;
    link?: string;
    notes?: string;
    tasks: Task[];
};

// A real application gets its own tab; a group without a plan or deadline (like "Every application") doesn't
export const isSchool = (c: Pick<College, "plan" | "deadline">) => Boolean(c.deadline || c.plan);

// Whole days from today to date (both YYYY-MM-DD); negative once it's passed
export const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / 864e5);

export function dueText(date: string, today: string) {
    const n = daysUntil(date, today);
    if (n < 0) return n === -1 ? "1 day late" : `${-n} days late`;
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    return `in ${n} days`;
}

export const shortDate = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

// Calendar file of what's still open: school deadlines plus tasks with their own date
export function toICS(colleges: College[], now = new Date()) {
    const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const events = colleges.flatMap((c) => [
        ...(c.deadline && c.status === "applying" ? [{ id: c.id, date: c.deadline, title: `${c.name} deadline` }] : []),
        ...c.tasks.filter((t) => t.due && !t.done).map((t) => ({ id: t.id, date: t.due!, title: `${t.text} (${c.name})` })),
    ]);
    return [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//willy.work//college//EN",
        ...events.flatMap((e) => [
            "BEGIN:VEVENT", `UID:${e.id}@willy.work`, `DTSTAMP:${stamp}`,
            `DTSTART;VALUE=DATE:${e.date.replace(/-/g, "")}`, `SUMMARY:${esc(e.title)}`, "END:VEVENT",
        ]),
        "END:VCALENDAR",
    ].join("\r\n");
}
