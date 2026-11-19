import type { PostType } from "../post/actions";
import Post, { byline } from "@/lib/PostModel";
import dbConnect from "@/lib/mongoose";
import { initAuth, ADMIN_EMAILS } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";
import PostMenu from "@/components/PostMenu";
import Cover from "@/components/Cover";
import RedactedText from "@/components/RedactedText";
import RiverBackground from "@/components/RiverBackground";
import "./timeline.css";

// how far each row of posts leans left or right, so the river between them winds (timeline.css)
const SHIFTS = [["-2.5vw", "0px"], ["3vw", "2vw"], ["-3vw", "-1vw"], ["2.5vw", "1.5vw"]];
const frost = "rounded-2xl bg-white/60 dark:bg-black/45 backdrop-blur-md";

// A bubble per post; the whole bubble opens the post (the title link stretches over it)
function PostCard({ post, admin, side }: { post: PostType; admin: boolean; side: "a" | "b" }) {
  return (
    <div className={`${side} reveal`}>
      <article className={`relative overflow-hidden transition-colors hover:bg-white/80 dark:hover:bg-black/65 ${frost}`}>
        <Cover
          image={post.image}
          className={post.image ? "" : "px-4 pt-4 pr-12"}
          title={<Link href={`/blogs/${post.id}`} className="after:absolute after:inset-0 after:rounded-2xl">{post.title}</Link>}
          sub={byline(post, "short")}
        />
        {/* padding goes on a wrapper: on the clamped paragraph itself, the cut-off line shows through it */}
        <div className="px-4 pb-4 pt-2">
          <p className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-snug"><RedactedText text={post.content.join("\n\n")} admin={admin} /></p>
        </div>
        {admin && <PostMenu id={post.id} title={post.title} image={post.image} />}
      </article>
    </div>
  );
}

// The stream and its scenery, then, as you scroll, the camera rises to look down on the river and the posts
// line its banks, newest first, alternating sides.
export default async function Page() {
  const session = await (await initAuth()).api.getSession({ headers: await headers() });
  const admin = !!session && ADMIN_EMAILS.includes(session.user.email);
  await dbConnect();
  const posts = (await Post.find().sort({ date: -1 })) as PostType[];
  const rows: PostType[][] = [];
  for (let i = 0; i < posts.length; i += 2) rows.push(posts.slice(i, i + 2));

  return (
    <main className="relative flex-1">
      <section id="river-hero" className="river-hero">
        {/* just the scenery, and a quiet way down to the posts at the bottom of the screen (timeline.css) */}
        <div className="flex justify-center">
          <a href="#river-flow" className="hero-down group flex flex-col items-center gap-2 text-white">
            <span className="rounded-full border border-white/60 px-5 py-1.5 text-sm tracking-wide backdrop-blur-[2px]
              transition-colors group-hover:bg-white/15 group-focus-visible:bg-white/15">My Blogs</span>
            <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 motion-safe:animate-bounce" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
          </a>
        </div>
      </section>
      {/* admins: Post, in the top right once the camera is down at the river (data-in-flow, set by RiverBackground) */}
      {admin && <Link href="/post" className="post-fab">Post</Link>}
      <div id="river-flow" className="river-flow">
        <h2 className="sr-only">Blogs</h2>
        {rows.map(([a, b], k) => (
          <section key={a.id} className="river-row" style={{ "--shift": SHIFTS[k % 4][0], "--shift-n": SHIFTS[k % 4][1] } as React.CSSProperties}>
            <PostCard post={a} admin={admin} side="a" />
            <div className="ch" aria-hidden />
            {b && <PostCard post={b} admin={admin} side="b" />}
          </section>
        ))}
        {!posts.length && <Link href="/post" className={`justify-self-center px-4 py-2 ${frost}`}>No blogs yet, create one here!</Link>}
      </div>
      <RiverBackground />
    </main>
  );
}
