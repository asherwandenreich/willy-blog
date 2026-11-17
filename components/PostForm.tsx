"use client";

import type { PostType } from "@/app/post/actions";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ImagePicker from "./ImagePicker";

const submit = "rounded-full px-5 py-2 bg-black dark:bg-white text-white dark:text-black hover:opacity-80 disabled:opacity-50";
const field = "w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2";

// request: for non-admins, who send the post to Willy to look over instead of publishing it
// initial: a published post being edited (postBlog then saves the changes)
function PostForm({
    postBlog,
    request = false,
    initial,
}: {
    postBlog: (post: PostType) => Promise<void>;
    request?: boolean;
    initial?: PostType;
}) {
    const router = useRouter();
    const [newPost, setNewPost] = useState<PostType>(initial ?? {
        id: crypto.randomUUID(),
        date: new Date(),
        title: "",
        content: [""],
    });
    const [posting, setPosting] = useState(false);
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const areas = useRef<(HTMLTextAreaElement | null)[]>([]);
    const focused = useRef(0); // the paragraph the Redact button acts on

    // Wrap the selected text in ||...|| (hidden from visitors), or unwrap it if it's already redacted.
    // A redaction can't cross a line break, so each selected line is wrapped on its own.
    function redact() {
        const i = focused.current, el = areas.current[i];
        if (!el || el.selectionStart === el.selectionEnd) return;
        const { selectionStart: s, selectionEnd: e, value } = el;
        const picked = value.slice(s, e);
        let text: string, from = s, to: number;
        if (value.slice(s - 2, s) === "||" && value.slice(e, e + 2) === "||") { // inside a redaction
            text = value.slice(0, s - 2) + picked + value.slice(e + 2);
            from = s - 2; to = e - 2;
        } else if (/^\|\|[^\n]+\|\|$/.test(picked)) { // a whole redaction, markers included
            text = value.slice(0, s) + picked.slice(2, -2) + value.slice(e);
            to = e - 4;
        } else {
            const wrapped = picked.split("\n").map((l) => (l.trim() ? `||${l}||` : l)).join("\n");
            text = value.slice(0, s) + wrapped + value.slice(e);
            to = s + wrapped.length;
        }
        const content = [...newPost.content];
        content[i] = text;
        setNewPost({ ...newPost, content });
        requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, to); });
    }

    async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        setPosting(true);
        setError("");
        try {
            await postBlog(newPost);
            if (request) setSent(true);
            else router.push("/blogs/" + newPost.id);
        } catch {
            setError(request ? "Couldn't send. Are you signed in?" : initial ? "Couldn't save. Are you signed in?" : "Couldn't publish. Are you signed in?");
            setPosting(false);
        }
    }

    if (sent) return <p className="my-6 text-lg">Sent! Willy will read it over. Thanks for writing.</p>;

    return (
        <form onSubmit={handleSubmit} className="my-3 flex flex-col gap-3">
            {/* a cover image above the post (admins only: uploads aren't open to visitors) */}
            {!request && <ImagePicker value={newPost.image} onChange={(image) => setNewPost({ ...newPost, image })} />}
            <input
                type="text"
                placeholder="Title"
                aria-label="Title"
                required
                className={`${field} text-2xl font-bold`}
                value={newPost.title}
                onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
            />
            {newPost.content.map((paragraph, i) => (
                <div key={i} className="relative">
                <textarea
                    ref={(el) => { areas.current[i] = el; }}
                    onFocus={() => (focused.current = i)}
                    placeholder={i === 0 ? "Write something..." : "Next paragraph"}
                    aria-label={`Paragraph ${i + 1}`}
                    rows={5}
                    className={`${field} leading-relaxed resize-y`}
                    value={paragraph}
                    onChange={(e) => {
                        const content = [...newPost.content];
                        content[i] = e.target.value;
                        setNewPost({ ...newPost, content: content });
                    }}
                />
                {newPost.content.length > 1 && (
                    <button
                        type="button"
                        aria-label={`Delete paragraph ${i + 1}`}
                        title="Delete paragraph"
                        className="absolute right-2 top-2 h-6 w-6 rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
                        onClick={() => setNewPost({ ...newPost, content: newPost.content.filter((_, j) => j !== i) })}
                    >
                        ×
                    </button>
                )}
                </div>
            ))}
            {!request && (
                <p className="text-xs text-zinc-500">
                    Select words and press Redact to hide them from visitors: they show as ||words|| here, a black bar for everyone but admins.
                </p>
            )}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    className="rounded-full px-5 py-2 border border-zinc-200 dark:border-zinc-800 hover:opacity-80"
                    onClick={() =>
                        setNewPost({ ...newPost, content: [...newPost.content, ""] })
                    }
                >
                    Add paragraph
                </button>
                <button
                    type="button"
                    disabled={newPost.content.length < 2}
                    className="rounded-full px-5 py-2 border border-zinc-200 dark:border-zinc-800 hover:opacity-80 disabled:opacity-40"
                    onClick={() => setNewPost({ ...newPost, content: newPost.content.slice(0, -1) })}
                >
                    Remove paragraph
                </button>
                {!request && (
                    <button
                        type="button"
                        title="Hide the selected text from visitors (only admins see it). Press again to un-redact."
                        className="rounded-full px-5 py-2 border border-zinc-200 dark:border-zinc-800 hover:opacity-80"
                        onMouseDown={(e) => e.preventDefault()} // keep the paragraph's selection
                        onClick={redact}
                    >
                        Redact
                    </button>
                )}
                {!request && (
                    <button type="submit" disabled={posting} className={`ml-auto ${submit}`}>
                        {initial ? (posting ? "Saving..." : "Save") : posting ? "Posting..." : "Post"}
                    </button>
                )}
            </div>
            {request && (
                <button type="submit" disabled={posting} className={`mt-3 self-end ${submit}`}>
                    {posting ? "Sending..." : "Submit request"}
                </button>
            )}
        </form>
    );
}

export default PostForm;
