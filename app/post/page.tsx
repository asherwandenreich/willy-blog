import { initAuth, ADMIN_EMAILS } from "@/lib/auth";
import { headers } from "next/headers";
import { postBlog, updatePost, type PostType } from "./actions";
import { redirect } from "next/navigation";
import Post from "@/lib/PostModel";
import dbConnect from "@/lib/mongoose";
import PostForm from "@/components/PostForm";

// A new post, or, with ?edit=<post id>, changes to a published one (admins only)
async function Page({ searchParams }: PageProps<"/post">) {
    const auth = await initAuth();
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session || !ADMIN_EMAILS.includes(session.user.email)) redirect("/");

    const { edit } = await searchParams;
    let initial: PostType | undefined;
    if (typeof edit === "string") {
        await dbConnect();
        const p = await Post.findOne({ id: edit }).lean<PostType>();
        if (!p) redirect("/blogs");
        // only plain fields: the database's own (_id and such) can't be handed to the browser
        initial = { id: p.id, date: p.date, title: p.title, content: p.content, ...(p.image ? { image: p.image } : {}) };
    }

    return(
        <main>
            <div className="max-w-2xl mx-auto">
                <h1 className="mt-3 text-4xl font-bold">{initial ? "Edit post" : "New post"}</h1>
                <PostForm key={initial?.id ?? "new"} postBlog={initial ? updatePost : postBlog} initial={initial} />
            </div>
        </main>
    );
}

export default Page;
