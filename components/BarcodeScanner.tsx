"use client";

import { useEffect, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatOneDReader, type IScannerControls } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import { lookupBarcode } from "@/app/calories/actions";
import type { BarcodeFood } from "@/lib/calories";

// /calories → Scan: reads a food barcode with the camera (or from a photo, or typed in), looks it up on
// Open Food Facts, and lets you pick servings or grams before logging it. Scanning runs on the phone
// (@zxing/browser, plain JS so it works in iPhone Safari too); only the barcode number goes to the server.

type Status =
    | { kind: "scanning" }
    | { kind: "looking"; code: string }
    | { kind: "found"; food: BarcodeFood }
    | { kind: "missing"; code: string }
    | { kind: "error"; message: string };

const field = "min-w-0 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-600 placeholder:text-zinc-400";
const quiet = "text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100";
const primary = "rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300";

// grocery barcodes only: EAN-13/8 (most of the world, including Japan) and UPC-A/E (US)
function makeReader() {
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]]]);
    return new BrowserMultiFormatOneDReader(hints);
}

export default function BarcodeScanner({ onAdd, onClose }: { onAdd: (name: string, calories: number, protein?: number) => void; onClose: () => void }) {
    const [status, setStatus] = useState<Status>({ kind: "scanning" });
    const [camera, setCamera] = useState<"starting" | "on" | "off">("starting");
    const [round, setRound] = useState(0); // bumping it restarts the camera for "Scan another"
    const video = useRef<HTMLVideoElement>(null);
    const controls = useRef<IScannerControls | null>(null);

    async function look(code: string) {
        controls.current?.stop();
        setStatus({ kind: "looking", code });
        try {
            const food = await lookupBarcode(code);
            setStatus(food ? { kind: "found", food } : { kind: "missing", code });
        } catch {
            setStatus({ kind: "error", message: "Couldn't reach the food database. Try again." });
        }
    }

    // live camera scanning while the status is "scanning"
    useEffect(() => {
        if (status.kind !== "scanning") return;
        let cancelled = false;
        makeReader()
            .decodeFromConstraints({ video: { facingMode: { ideal: "environment" } } }, video.current!, (result, _err, ctl) => {
                if (result && !cancelled) { ctl.stop(); look(result.getText()); }
            })
            .then((ctl) => {
                if (cancelled) ctl.stop();
                else { controls.current = ctl; setCamera("on"); }
            })
            .catch(() => { if (!cancelled) setCamera("off"); }); // blocked, no camera, or not https
        return () => { cancelled = true; controls.current?.stop(); controls.current = null; };
    }, [status.kind, round]); // restarts only when a new scan begins

    async function fromPhoto(file: File) {
        const url = URL.createObjectURL(file);
        try { look((await makeReader().decodeFromImageUrl(url)).getText()); }
        catch { setStatus({ kind: "error", message: "No barcode found in that photo. Try a closer, sharper one." }); }
        finally { URL.revokeObjectURL(url); }
    }

    const again = () => { setCamera("starting"); setStatus({ kind: "scanning" }); setRound((r) => r + 1); };

    return (
        <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-500">Scan a barcode</h2>
                <button type="button" onClick={onClose} className={quiet} aria-label="Close scanner">Close</button>
            </div>

            {status.kind === "scanning" && (<>
                {camera !== "off" ? (
                    <div className="relative overflow-hidden rounded-md bg-black aspect-[4/3] sm:aspect-[16/9]">
                        <video ref={video} muted playsInline className="h-full w-full object-cover" />
                        {/* aiming guide */}
                        <div aria-hidden className="pointer-events-none absolute inset-x-[12%] top-1/2 h-[30%] -translate-y-1/2 rounded-md border-2 border-white/70" />
                        {camera === "starting" && <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Starting camera…</p>}
                    </div>
                ) : (
                    <p className="rounded-md bg-zinc-100 dark:bg-zinc-900 px-3 py-4 text-center text-sm text-zinc-500">
                        Camera unavailable. Allow camera access, or use a photo or the number below.
                        {/* keeps the ref target mounted so a retry can attach */}
                        <video ref={video} muted playsInline className="hidden" />
                    </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className={`${quiet} cursor-pointer rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5`}>
                        Use a photo
                        <input type="file" accept="image/*" capture="environment" className="sr-only"
                            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) fromPhoto(f); }} />
                    </label>
                    <form className="flex flex-1 gap-2" onSubmit={(e: React.SubmitEvent<HTMLFormElement>) => {
                        e.preventDefault();
                        const code = String(new FormData(e.currentTarget).get("code")).replace(/\D/g, "");
                        if (code.length >= 8) look(code);
                    }}>
                        <input name="code" inputMode="numeric" pattern="[0-9 ]{8,16}" placeholder="or type the number" aria-label="Barcode number" autoComplete="off" className={`${field} flex-1 basis-36`} />
                        <button type="submit" className={quiet}>Look up</button>
                    </form>
                </div>
            </>)}

            {status.kind === "looking" && <p className="py-6 text-center text-sm text-zinc-500">Looking up {status.code}…</p>}

            {status.kind === "missing" && (
                <div className="py-4 text-center text-sm text-zinc-500">
                    <p>{status.code} isn&apos;t in Open Food Facts yet. Type it in with the form above.</p>
                    <button type="button" onClick={again} className={`${quiet} mt-2 underline`}>Scan another</button>
                </div>
            )}

            {status.kind === "error" && (
                <div className="py-4 text-center text-sm text-zinc-500">
                    <p>{status.message}</p>
                    <button type="button" onClick={again} className={`${quiet} mt-2 underline`}>Try again</button>
                </div>
            )}

            {status.kind === "found" && <Found food={status.food} onAdd={(n, c, p) => { onAdd(n, c, p); again(); }} onAgain={again} />}
        </div>
    );
}

// The product card: pick how much, see the numbers, add it
function Found({ food, onAdd, onAgain }: { food: BarcodeFood; onAdd: (name: string, calories: number, protein?: number) => void; onAgain: () => void }) {
    const canServe = food.kcalServing !== undefined;
    const canWeigh = food.kcal100 !== undefined;
    const [unit, setUnit] = useState<"serving" | "g">(canServe ? "serving" : "g");
    const [amount, setAmount] = useState(String(canServe ? 1 : food.servingGrams ?? 100));

    const qty = Math.max(0, Number(amount) || 0);
    const kcal = Math.round(unit === "serving" ? qty * food.kcalServing! : (qty / 100) * food.kcal100!);
    const perProtein = unit === "serving" ? food.proteinServing : food.protein100;
    const protein = perProtein === undefined ? undefined : Math.round(unit === "serving" ? qty * perProtein : (qty / 100) * perProtein);
    const label = `${food.name}${unit === "serving" ? (qty === 1 ? "" : ` ×${qty}`) : `, ${qty} g`}`;

    return (
        <div>
            <p className="font-bold leading-snug">{food.name}</p>
            <p className="text-sm text-zinc-500">
                {[food.brand, food.servingLabel && `serving: ${food.servingLabel}`].filter(Boolean).join(" · ") || `Barcode ${food.code}`}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <input type="number" min={0} step={unit === "serving" ? 0.5 : 5} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                    aria-label={unit === "serving" ? "Servings" : "Grams"} className={`${field} w-24`} />
                {canServe && canWeigh ? (
                    <div className="flex rounded-md border border-zinc-200 dark:border-zinc-800 p-0.5 text-sm" role="radiogroup" aria-label="Unit">
                        {(["serving", "g"] as const).map((u) => (
                            <button key={u} type="button" role="radio" aria-checked={unit === u}
                                onClick={() => { setUnit(u); setAmount(String(u === "serving" ? 1 : food.servingGrams ?? 100)); }}
                                className={`rounded px-2 py-1 ${unit === u ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-black" : "text-zinc-500"}`}>
                                {u === "serving" ? "servings" : "grams"}
                            </button>
                        ))}
                    </div>
                ) : <span className="text-sm text-zinc-500">{unit === "serving" ? "servings" : "grams"}</span>}
                <span className="ml-auto text-sm tabular-nums"><b>{kcal}</b> kcal{protein !== undefined && <span className="text-zinc-500"> · {protein} g protein</span>}</span>
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
                <button type="button" onClick={onAgain} className={quiet}>Scan another</button>
                <button type="button" disabled={qty <= 0} onClick={() => onAdd(label, kcal, protein)} className={`${primary} disabled:opacity-40`}>Add</button>
            </div>
        </div>
    );
}
