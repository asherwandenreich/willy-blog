// Post text where ||parts like this|| are redacted. Admins see them highlighted; everyone else gets a bar,
// built on the server, so the hidden words never reach a visitor's browser. A redaction stays on one line.
export default function RedactedText({ text, admin }: { text: string; admin: boolean }) {
    return text.split(/\|\|(.+?)\|\|/).map((part, i) => {
        if (i % 2 === 0) return part;
        if (admin) return (
            <mark key={i} title="Redacted for visitors"
                className="rounded-sm bg-red-200/70 dark:bg-red-900/60 text-inherit underline decoration-dashed decoration-red-700/60 underline-offset-2">
                {part}
            </mark>
        );
        // rounded up to whole 6-letter blocks, so the bar doesn't give away the exact length
        const blocks = Array(Math.ceil(part.length / 6)).fill("xxxxx").join(" ");
        return (
            <span key={i} role="img" aria-label="redacted"
                className="rounded-sm bg-zinc-900 dark:bg-zinc-200 text-transparent select-none [box-decoration-break:clone]">
                {blocks}
            </span>
        );
    });
}
