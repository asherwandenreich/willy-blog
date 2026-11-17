"use client";

import { startTransition, useOptimistic, useRef, useState } from "react";
import { addShoppingItem, clearCheckedShoppingItems, deleteShoppingItem, setShoppingItemDone } from "@/app/profile/shopping-actions";
import { cleanLink, formatPrice, linkHost, parsePrice } from "@/lib/shopping";

// Admin profile → Shopping: a Todoist-style list. Add items (with an optional price and link) under the list,
// click the circle to check one off. Changes show at once and save in the background; the page refreshes
// itself from the database afterwards.

export type ShoppingItem = { id: string; text: string; price?: number; link?: string; done: boolean; createdAt: number; doneAt?: number };

type Update = (list: ShoppingItem[]) => ShoppingItem[];
const isTemp = (id: string) => id.startsWith("tmp-");
const quiet = "text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";
const pill = "flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 px-3 py-1 text-sm focus-within:border-zinc-400 dark:focus-within:border-zinc-600";

const LinkIcon = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
    <svg viewBox="0 0 16 16" className={`${className} shrink-0`} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M6.5 9.5a3 3 0 0 0 4.2 0l2-2a3 3 0 0 0-4.2-4.2l-.7.7M9.5 6.5a3 3 0 0 0-4.2 0l-2 2a3 3 0 0 0 4.2 4.2l.7-.7" />
    </svg>
);

// The round Todoist checkbox: an empty ring, a faint check on hover, filled once it's checked off
function Check({ item, onToggle }: { item: ShoppingItem; onToggle: () => void }) {
    return (
        <button type="button" role="checkbox" aria-checked={item.done} aria-label={item.text} disabled={isTemp(item.id)} onClick={onToggle}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${item.done
                ? "border-zinc-400 bg-zinc-400 text-white dark:border-zinc-600 dark:bg-zinc-600 dark:text-black"
                : "border-zinc-400 text-transparent hover:text-zinc-400 dark:border-zinc-600 dark:hover:text-zinc-600"}`}>
            <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        </button>
    );
}

function Row({ item, onToggle, onDelete }: { item: ShoppingItem; onToggle: () => void; onDelete: () => void }) {
    return (
        <li className="group flex items-center gap-3 py-2.5">
            <Check item={item} onToggle={onToggle} />
            <div className="flex flex-1 min-w-0 flex-wrap items-baseline gap-x-2">
                {/* clicking the words checks it off too, like Todoist's whole row */}
                <span onClick={isTemp(item.id) ? undefined : onToggle}
                    className={`cursor-pointer break-words ${item.done ? "line-through text-zinc-400" : ""}`}>
                    {item.text}
                </span>
                {item.link && (
                    <a href={item.link} target="_blank" rel="noreferrer" className={`${quiet} inline-flex items-center gap-1 self-center`}>
                        <LinkIcon className="h-3 w-3" />{linkHost(item.link)}
                    </a>
                )}
            </div>
            {item.price !== undefined && (
                <span className={`shrink-0 text-sm tabular-nums ${item.done ? "text-zinc-400 line-through" : "text-zinc-500"}`}>{formatPrice(item.price)}</span>
            )}
            {!isTemp(item.id) && (
                <button type="button" aria-label={`Delete ${item.text}`} onClick={onDelete}
                    className={`${quiet} px-1 text-lg leading-none sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100`}>
                    ×
                </button>
            )}
        </li>
    );
}

export default function ShoppingList({ items }: { items: ShoppingItem[] }) {
    const [list, apply] = useOptimistic(items, (state: ShoppingItem[], update: Update) => update(state));
    const [error, setError] = useState("");
    const [sure, setSure] = useState(false); // "Clear" takes two clicks instead of confirm()
    const nameInput = useRef<HTMLInputElement>(null);

    function run(update: Update, server: () => Promise<unknown>) {
        setError("");
        startTransition(async () => {
            apply(update);
            try { await server(); } catch { setError("Couldn't save that change. Refresh and try again."); }
        });
    }

    // still to buy in the order they were added; checked off with the most recent first
    const open = list.filter((i) => !i.done).sort((a, b) => a.createdAt - b.createdAt);
    const checked = list.filter((i) => i.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    const total = open.reduce((sum, i) => sum + (i.price ?? 0), 0);

    const toggle = (item: ShoppingItem) => run(
        (l) => l.map((x) => (x.id === item.id ? { ...x, done: !x.done, doneAt: x.done ? undefined : Date.now() } : x)),
        () => setShoppingItemDone(item.id, !item.done),
    );
    const remove = (item: ShoppingItem) => run((l) => l.filter((x) => x.id !== item.id), () => deleteShoppingItem(item.id));

    function add(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const data = new FormData(form);
        const f = { text: String(data.get("text") ?? "").trim(), price: String(data.get("price") ?? "").trim(), link: String(data.get("link") ?? "").trim() };
        if (!f.text) return nameInput.current?.focus();
        const price = parsePrice(f.price);
        const link = cleanLink(f.link);
        if (f.price && price === undefined) return setError("Price should look like 4.99");
        if (f.link && !link) return setError("That link doesn't look like a web address");
        form.reset();
        nameInput.current?.focus(); // ready for the next item right away
        run((l) => [...l, { id: `tmp-${Date.now()}`, text: f.text, price, link, done: false, createdAt: Date.now() }], () => addShoppingItem(f));
    }

    return (<>
        <h1 className="mt-10 mb-2 text-4xl font-bold">Shopping</h1>
        <p className="mb-6 text-zinc-500">
            {open.length ? `${open.length} to buy` : "Nothing to buy right now."}
            {total > 0 && <> · <span className="tabular-nums">{formatPrice(total)}</span></>}
        </p>

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
            {open.map((i) => <Row key={i.id} item={i} onToggle={() => toggle(i)} onDelete={() => remove(i)} />)}
        </ul>

        <form onSubmit={add} className={`py-2.5 ${open.length ? "border-t border-zinc-100 dark:border-zinc-900" : ""}`}>
            <div className="flex items-center gap-3">
                <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center text-xl leading-none text-zinc-400">+</span>
                <input ref={nameInput} name="text" maxLength={200} placeholder="Add item" aria-label="Item" autoComplete="off"
                    className="flex-1 min-w-0 bg-transparent py-1 outline-none placeholder:text-zinc-400" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                <label className={`${pill} w-24`}>
                    <span className="text-zinc-400">$</span>
                    <input name="price" inputMode="decimal" placeholder="Price" aria-label="Price (optional)" autoComplete="off"
                        className="w-full min-w-0 bg-transparent outline-none placeholder:text-zinc-400" />
                </label>
                <label className={`${pill} min-w-28 flex-1`}>
                    <span className="text-zinc-400"><LinkIcon /></span>
                    <input name="link" inputMode="url" placeholder="Link" aria-label="Link (optional)" autoComplete="off"
                        className="w-full min-w-0 bg-transparent outline-none placeholder:text-zinc-400" />
                </label>
                <button className="rounded-full px-4 py-1 text-sm bg-black dark:bg-white text-white dark:text-black hover:opacity-80">Add</button>
            </div>
        </form>
        {error && <p role="alert" className="mt-1 pl-8 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {checked.length > 0 && (
            <section className="mt-8">
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-1">
                    <h2 className="text-sm font-bold text-zinc-500">Checked off · {checked.length}</h2>
                    <button type="button" className={`${quiet} ${sure ? "text-red-600 dark:text-red-400" : ""}`}
                        onClick={() => {
                            if (!sure) { setSure(true); setTimeout(() => setSure(false), 3000); return; }
                            setSure(false);
                            run((l) => l.filter((x) => !x.done), () => clearCheckedShoppingItems());
                        }}>
                        {sure ? "Sure?" : "Clear"}
                    </button>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                    {checked.map((i) => <Row key={i.id} item={i} onToggle={() => toggle(i)} onDelete={() => remove(i)} />)}
                </ul>
            </section>
        )}
    </>);
}
