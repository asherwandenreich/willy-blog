"use server";

import { revalidatePath } from "next/cache";
import { adminSession } from "@/lib/admin";
import dbConnect from "@/lib/mongoose";
import FoodEntry from "@/lib/CalorieModel";
import SupplementDay from "@/lib/SupplementDayModel";
import { DAY_RE, SUPPLEMENTS, type BarcodeFood } from "@/lib/calories";

// Admin only: logging and removing food on /calories

async function admin() {
    if (!(await adminSession())) throw new Error("Unauthorized");
    await dbConnect();
}

// whole numbers between 0 and max; anything else (blank, NaN, negative) becomes undefined
const amount = (n: unknown, max: number) => {
    const v = Math.round(Number(n));
    return Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;
};

export async function addFoodEntry(day: string, name: string, calories: number, protein?: number) {
    await admin();
    if (typeof day !== "string" || !DAY_RE.test(day)) throw new Error("Bad day");
    const clean = typeof name === "string" ? name.trim().slice(0, 120) : "";
    const kcal = amount(calories, 10000);
    if (!clean || kcal === undefined) throw new Error("Name and calories required");
    await FoodEntry.create({ day, name: clean, calories: kcal, protein: amount(protein, 1000) });
    revalidatePath("/calories");
}

// Barcode scanner: looks a scanned EAN/UPC up on Open Food Facts (free, no key, world.openfoodfacts.org).
// Returns null when the product isn't there or has no calories listed.
export async function lookupBarcode(code: string): Promise<BarcodeFood | null> {
    if (!(await adminSession())) throw new Error("Unauthorized");
    if (typeof code !== "string" || !/^\d{8,14}$/.test(code)) throw new Error("Bad barcode");

    const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`;
    // OFF asks apps to name themselves; no contact details are sent
    const res = await fetch(url, { headers: { "User-Agent": "willy.work-calorie-tracker/0.1" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null; // 404 = not in the database
    const { product: p } = (await res.json()) as {
        product?: {
            product_name?: string; product_name_en?: string; brands?: string; serving_size?: string; serving_quantity?: number | string;
            nutriments?: Record<string, number | string | undefined>;
        };
    };
    if (!p) return null;

    const n = p.nutriments ?? {};
    const num = (v: unknown) => (v === undefined || v === "" || !Number.isFinite(Number(v)) ? undefined : Math.max(0, Number(v)));
    const food: BarcodeFood = {
        code,
        name: (p.product_name || p.product_name_en || "").trim() || `Barcode ${code}`,
        brand: p.brands?.split(",")[0]?.trim() || undefined,
        servingLabel: p.serving_size?.trim() || undefined,
        servingGrams: num(p.serving_quantity),
        kcalServing: num(n["energy-kcal_serving"]),
        proteinServing: num(n["proteins_serving"]),
        kcal100: num(n["energy-kcal_100g"]),
        protein100: num(n["proteins_100g"]),
    };
    return food.kcalServing === undefined && food.kcal100 === undefined ? null : food;
}

// The vitamin checkoff: marks one supplement taken (or not) on one day
export async function setSupplementTaken(day: string, id: string, taken: boolean) {
    await admin();
    if (typeof day !== "string" || !DAY_RE.test(day)) throw new Error("Bad day");
    if (!SUPPLEMENTS.some((s) => s.id === id)) throw new Error("Unknown supplement");
    await SupplementDay.updateOne({ day }, taken ? { $addToSet: { taken: id } } : { $pull: { taken: id } }, { upsert: true });
    revalidatePath("/calories");
}

export async function deleteFoodEntry(id: string) {
    await admin();
    await FoodEntry.deleteOne({ _id: String(id) });
    revalidatePath("/calories");
}
