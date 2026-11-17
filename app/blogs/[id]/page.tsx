import type { PostType } from "@/app/post/actions";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import Post from "@/lib/PostModel";
import dbConnect from "@/lib/mongoose";
import { initAuth, ADMIN_EMAILS } from "@/lib/auth";
import Cover from "@/components/Cover";
import RedactedText from "@/components/RedactedText";

async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await (await initAuth()).api.getSession({ headers: await headers() });
  const admin = !!session && ADMIN_EMAILS.includes(session.user.email);
  await dbConnect();
  const post = (await Post.findOne({ id: id })) as PostType;
  if (!post) redirect("/");

  return (
    <main className="w-full max-w-2xl mx-auto px-4 pb-10">
      <Cover
        big
        image={post.image}
        className="mt-10 mb-6"
        title={post.title}
        sub={post.date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
      />
      {admin && (
        <Link href={`/post?edit=${encodeURIComponent(post.id)}`}
          className="mb-4 inline-block rounded-full px-4 py-1.5 text-sm border border-zinc-200 dark:border-zinc-800 hover:opacity-80">
          Edit post
        </Link>
      )}
      {/* keep the line breaks and spaces as typed (HTML squashes them into one space otherwise) */}
      <div className="flex flex-col gap-4 whitespace-pre-wrap leading-relaxed">
        {post.content.map((paragraph, i) => (
          <p key={i}><RedactedText text={paragraph} admin={admin} /></p>
        ))}
      </div>
    </main>
  );
}

export default Page;
