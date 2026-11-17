"use server";

import { revalidatePath } from "next/cache";
import { adminSession } from "@/lib/admin";
import dbConnect from "@/lib/mongoose";
import ShoppingItem from "@/lib/ShoppingModel";
import { cleanLink, parsePrice } from "@/lib/shopping";

// Admin only: edits to the shopping list on /profile?tab=shopping

async function admin() {
    if (!(await adminSession())) throw new Error("Unauthorized");
    await dbConnect();
}

const refresh = () => revalidatePath("/profile");

export type ShoppingFields = { text: string; price: string; link: string };

// Price and link are optional; one that can't be read is just left off
export async function addShoppingItem(f: ShoppingFields) {
    await admin();
    const text = typeof f?.text === "string" ? f.text.trim().slice(0, 200) : "";
    if (!text) throw new Error("Item required");
    await ShoppingItem.create({ text, price: parsePrice(f.price), link: cleanLink(f.link) });
    refresh();
}

export async function setShoppingItemDone(id: string, done: boolean) {
    await admin();
    await ShoppingItem.updateOne({ _id: String(id) }, done ? { $set: { done: true, doneAt: new Date() } } : { $set: { done: false }, $unset: { doneAt: 1 } });
    refresh();
}

export async function deleteShoppingItem(id: string) {
    await admin();
    await ShoppingItem.deleteOne({ _id: String(id) });
    refresh();
}

// "Clear" under Checked off: removes everything already bought
export async function clearCheckedShoppingItems() {
    await admin();
    await ShoppingItem.deleteMany({ done: true });
    refresh();
}
