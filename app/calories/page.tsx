import type { Metadata } from "next";
import { headers } from "next/headers";
import { initAuth, ADMIN_EMAILS } from "@/lib/auth";
import dbConnect from "@/lib/mongoose";
import FoodEntryModel from "@/lib/CalorieModel";
import SupplementDayModel from "@/lib/SupplementDayModel";
import { DAY_RE, shiftDay, todayKey, type FoodEntry, type QuickFood } from "@/lib/calories";
import CalorieTracker from "@/components/CalorieTracker";
import SignInForm from "@/components/SignInForm";

export const metadata: Metadata = { title: "Calories · willy.work" };

type Doc = { _id: unknown; day: string; name: string; calories: number; protein?: number; createdAt: Date };

// Calorie tracker: what Willy ate on one day (?day=YYYY-MM-DD, default today) against a daily goal,
// plus the past week's totals. Private: only an admin gets past the sign-in.
export default async function CaloriesPage({ searchParams }: PageProps<"/calories">) {
    const session = await (await initAuth()).api.getSession({ headers: await headers() });
    if (!session) return <main><SignInForm /></main>;
    if (!ADMIN_EMAILS.includes(session.user.email)) {
        return <main className="flex-1 px-4 py-16 text-center text-zinc-500">The calorie tracker is private.</main>;
    }

    const today = todayKey();
    const asked = (await searchParams).day;
    // no logging into the future
    const day = typeof asked === "string" && DAY_RE.test(asked) && asked <= today ? asked : today;

    await dbConnect();
    const weekStart = shiftDay(day, -6);
    const docs = (await FoodEntryModel.find({ day: { $gte: weekStart, $lte: day } }).sort({ createdAt: 1 }).lean()) as unknown as Doc[];

    const entries: FoodEntry[] = docs.filter((d) => d.day === day).map((d) => ({
        id: String(d._id), name: d.name, calories: d.calories, protein: d.protein, createdAt: d.createdAt.getTime(),
    }));
    // the seven days ending on the shown day, oldest first, for the little bar chart
    const week = Array.from({ length: 7 }, (_, i) => {
        const key = shiftDay(weekStart, i);
        return { day: key, calories: docs.filter((d) => d.day === key).reduce((sum, d) => sum + d.calories, 0) };
    });

    const vitamins = (await SupplementDayModel.findOne({ day }).lean()) as unknown as { taken?: string[] } | null;
    const recents = await loadRecents();

    return <CalorieTracker key={day} day={day} today={today} entries={entries} week={week} taken={vitamins?.taken ?? []} recents={recents} />;
}

// Recents: the last dozen different foods logged on any day, newest first, with the numbers from their latest log.
// Same name in different capitals counts as one food.
async function loadRecents(): Promise<QuickFood[]> {
    type Recent = { name: string; calories: number; protein?: number };
    const docs = (await FoodEntryModel.find({}, { name: 1, calories: 1, protein: 1 }).sort({ createdAt: -1 }).limit(300).lean()) as unknown as Recent[];
    const seen = new Set<string>();
    const out: QuickFood[] = [];
    for (const d of docs) {
        const key = d.name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name: d.name, calories: d.calories, protein: d.protein });
        if (out.length === 12) break;
    }
    return out;
}
