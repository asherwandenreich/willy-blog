// Shopping list helpers shared by the list (instant updates) and its server actions (what actually gets saved)

// "4.99", "$4.99", "5" or "1,299.5" → cents (499, 499, 500, 129950). Anything else (or blank) → undefined.
// Prices are kept in whole cents so adding them up never gives 12.469999.
export function parsePrice(input: unknown): number | undefined {
    const s = typeof input === "string" ? input.replace(/[$,\s]/g, "") : "";
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return undefined;
    const cents = Math.round(parseFloat(s) * 100);
    return cents <= 100_000_000 ? cents : undefined; // up to $1,000,000
}

export const formatPrice = (cents: number) =>
    (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

// "amazon.com/dp/..." → "https://amazon.com/dp/...". Only http(s) links are kept (no javascript: links).
export function cleanLink(input: unknown): string | undefined {
    const s = typeof input === "string" ? input.trim().slice(0, 2000) : "";
    if (!s) return undefined;
    try {
        const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(s) ? s : `https://${s}`);
        return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
    } catch {
        return undefined;
    }
}

// "https://www.amazon.com/dp/..." → "amazon.com", shown next to the item
export function linkHost(link: string) {
    try { return new URL(link).hostname.replace(/^www\./, ""); } catch { return "link"; }
}
