"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { NAME_MAX } from "@/lib/names";

// On /profile: the name you go by on the site (your profile, and the byline on any blog of yours Willy posts).
// Saved on your account; the server checks the length too (lib/auth.ts).
export default function NameForm({ name }: { name: string }) {
    const router = useRouter();
    const [value, setValue] = useState(name);
    const [saving, setSaving] = useState(false);
    const [note, setNote] = useState("");
    const changed = value.trim() !== name;

    async function save(e: React.SubmitEvent<HTMLFormElement>) {
        e.preventDefault();
        setSaving(true);
        setNote("");
        const { error } = await authClient.updateUser({ name: value.trim() });
        setSaving(false);
        if (error) return setNote(error.message ?? "Couldn't save your name.");
        setNote("Saved.");
        router.refresh(); // the welcome line above picks up the new name
    }

    return (
        <form onSubmit={save} className="mb-8 flex flex-col gap-2">
            <label htmlFor="display-name" className="text-sm font-bold">Your name</label>
            <div className="flex flex-wrap items-center gap-2">
                <input
                    id="display-name"
                    required
                    maxLength={NAME_MAX}
                    className="w-64 max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2"
                    value={value}
                    onChange={(e) => { setValue(e.target.value); setNote(""); }}
                />
                <button type="submit" disabled={saving || !changed || !value.trim()}
                    className="rounded-full px-5 py-2 bg-black dark:bg-white text-white dark:text-black hover:opacity-80 disabled:opacity-40">
                    {saving ? "Saving..." : "Save"}
                </button>
                <span className="text-xs text-zinc-500">{value.length}/{NAME_MAX}</span>
            </div>
            <p className="text-xs text-zinc-500">Shown on your profile, and on any blog of yours that gets posted.</p>
            {note && <p className={`text-sm ${note === "Saved." ? "text-zinc-500" : "text-red-600 dark:text-red-400"}`}>{note}</p>}
        </form>
    );
}
