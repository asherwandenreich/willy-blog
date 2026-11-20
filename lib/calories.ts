// Shared bits for the calorie tracker (/calories): types, the daily goal, quick-add foods and day keys.
// Safe to import from both server and client code.

export type FoodEntry = { id: string; name: string; calories: number; protein?: number; createdAt: number };

export type QuickFood = { name: string; calories: number; protein?: number };

// A packaged food found by barcode (app/calories/actions.ts → lookupBarcode). Open Food Facts lists
// per-100 g numbers for most products and per-serving numbers only for some.
export type BarcodeFood = {
    code: string; name: string; brand?: string;
    servingLabel?: string; servingGrams?: number; // e.g. "1 bowl (126 g)" and 126
    kcalServing?: number; proteinServing?: number;
    kcal100?: number; protein100?: number;
};

export const DAILY_GOAL = 2000;
export const PROTEIN_GOAL = 120; // grams: about 1 g per lb of body weight, for losing fat while building muscle

// The daily vitamin checkoff. `id` is what gets saved, so keep it stable if a name changes.
export const SUPPLEMENTS = [
    { id: "d3", name: "Vitamin D3", when: "with a meal that has fat" },
    { id: "fish-oil", name: "Fish oil", when: "same meal as D3" },
] as const;
export type SupplementId = (typeof SUPPLEMENTS)[number]["id"];

// Shown under Recents until there's history to show instead. Calories are typical estimates, not label values.
export const QUICK_FOODS: QuickFood[] = [
    { name: "Hard-boiled egg", calories: 78, protein: 6 },
    { name: "Ichiran instant ramen", calories: 450, protein: 15 },
    { name: "Marugame beef, 100 g", calories: 270, protein: 15 },
    { name: "Jalapeño cheese bagel", calories: 320, protein: 12 },
    { name: "Cream cheese, 2 tbsp", calories: 100, protein: 2 },
];

// A day is stored as "YYYY-MM-DD" in California time, so a late dinner counts toward the day it was eaten
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const todayKey = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

// Moves a day key by whole days (noon UTC keeps daylight-saving changes from skipping a day)
export function shiftDay(day: string, by: number) {
    const d = new Date(`${day}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + by);
    return d.toISOString().slice(0, 10);
}

export function dayLabel(day: string, today: string) {
    if (day === today) return "Today";
    if (day === shiftDay(today, -1)) return "Yesterday";
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}
