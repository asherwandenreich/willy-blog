import { headers } from "next/headers";
import Link from "next/link";
import { initAuth, ADMIN_EMAILS } from "@/lib/auth";
import dbConnect from "@/lib/mongoose";
import Inbox from "@/lib/InboxModel";
import SignInForm from "@/components/SignInForm";
import SignOutButton from "@/components/SignOutButton";
import PostForm from "@/components/PostForm";
import MessageForm from "@/components/MessageForm";
import ReviewButtons from "@/components/ReviewButtons";
import CollegeHub from "@/components/CollegeHub";
import CollegeModel from "@/lib/CollegeModel";
import { COLLEGE_SEED } from "@/lib/collegeSeed";
import type { College } from "@/lib/college";
import ShoppingList, { type ShoppingItem } from "@/components/ShoppingList";
import ShoppingItemModel from "@/lib/ShoppingModel";
import ProfileIcon from "@/components/ProfileIcon";
import Backend from "@/components/Backend";
import { BackendLink } from "@/components/BackendLink";
import { requestBlog } from "./actions";

const heading = "mt-10 mb-6 text-4xl font-bold";

type Request = { _id: unknown; name: string; email: string; title: string; content: string[]; createdAt: Date };

// Admins: blog requests from visitors, oldest first
async function BlogRequests() {
  await dbConnect();
  const requests = (await Inbox.find({ kind: "blog" }).sort({ createdAt: 1 }).lean()) as Request[];
  return (<>
    <h1 className={heading}>Blog requests</h1>
    {requests.length === 0 && <p className="text-zinc-500">Nothing to review right now.</p>}
    <ul className="flex flex-col gap-4">
      {requests.map((r) => (
        <li key={String(r._id)} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
          <h2 className="text-xl font-bold">{r.title}</h2>
          <p className="mb-3 text-sm text-zinc-500">
            from {r.name} ({r.email}) · {r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          <div className="flex flex-col gap-3 whitespace-pre-wrap leading-relaxed">
            {r.content.map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <ReviewButtons id={String(r._id)} />
        </li>
      ))}
    </ul>
  </>);
}

// Admins: the college application tracker. The first visit fills it from lib/collegeSeed.ts.
async function loadColleges(): Promise<College[]> {
  await dbConnect();
  if (!(await CollegeModel.exists({}))) await CollegeModel.insertMany(COLLEGE_SEED.map((c, order) => ({ ...c, order })));
  type Doc = Omit<College, "id" | "tasks"> & { _id: unknown; tasks: (Omit<College["tasks"][number], "id"> & { _id: unknown })[] };
  const docs = (await CollegeModel.find().sort({ order: 1, createdAt: 1 }).lean()) as unknown as Doc[];
  return docs.map((c) => ({
    id: String(c._id), name: c.name, plan: c.plan || undefined, deadline: c.deadline || undefined, portal: c.portal || undefined,
    status: c.status, link: c.link || undefined, notes: c.notes || undefined,
    tasks: c.tasks.map((t) => ({ id: String(t._id), text: t.text, due: t.due || undefined, done: Boolean(t.done), details: t.details || undefined, link: t.link || undefined })),
  }));
}

// Admins: the shopping list (the component sorts it into "to buy" and "checked off")
async function loadShopping(): Promise<ShoppingItem[]> {
  await dbConnect();
  type Doc = { _id: unknown; text: string; price?: number; link?: string; done?: boolean; createdAt: Date; doneAt?: Date };
  const docs = (await ShoppingItemModel.find().lean()) as unknown as Doc[];
  return docs.map((i) => ({
    id: String(i._id), text: i.text, price: i.price ?? undefined, link: i.link || undefined,
    done: Boolean(i.done), createdAt: i.createdAt.getTime(), doneAt: i.doneAt?.getTime(),
  }));
}

export default async function Profile({ searchParams }: PageProps<"/profile">) {
  const auth = await initAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return <main><SignInForm /></main>;

  const admin = ADMIN_EMAILS.includes(session.user.email);
  // the sidebar's choices; ?tab= picks which one fills the main area
  const tabs = admin
    ? [{ tab: "", label: "Home" }, { tab: "requests", label: "Blog requests" }, { tab: "college", label: "College" }, { tab: "shopping", label: "Shopping" }, { tab: "backend", label: "Backend" }]
    : [{ tab: "", label: "Home" }, { tab: "contribute", label: "Contribute a blog" }, { tab: "message", label: "Send a message" }];
  const params = await searchParams;
  const asked = params.tab;
  const current = tabs.find((t) => t.tab === asked)?.tab ?? "";

  // the College page's own tab row picks the school (?school=)
  const colleges = current === "college" ? await loadColleges() : [];
  const shopping = current === "shopping" ? await loadShopping() : [];
  const school = typeof params.school === "string" ? params.school : "";
  // "today" in California, so days-left counts match the calendar on the wall
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

  return (
    <main className="flex-1 flex flex-col sm:flex-row">
      <aside className="profile-aside sm:w-56 shrink-0 flex sm:flex-col gap-1 p-3 border-b sm:border-b-0 sm:border-r border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        {tabs.map((t) => {
          const Tab = t.tab === "backend" ? BackendLink : Link;
          return (
          <Tab
            key={t.tab}
            href={t.tab ? `/profile?tab=${t.tab}` : "/profile"}
            aria-current={t.tab === current ? "page" : undefined}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${t.tab === current
              ? "bg-zinc-100 dark:bg-zinc-900 font-bold"
              : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:hover:bg-zinc-950 dark:hover:text-zinc-100"}`}
          >
            <ProfileIcon tab={t.tab} />
            {t.label}
          </Tab>
        ); })}
      </aside>
      <section className="flex-1 min-w-0 px-4 sm:px-10 pb-10">
        <div className="max-w-2xl mx-auto">
          {current === "" && (<>
            <h1 className={heading}>Welcome, {session.user.name}</h1>
            <SignOutButton />
          </>)}
          {current === "contribute" && (<>
            <h1 className={heading}>Contribute a blog</h1>
            <p className="-mt-3 text-zinc-500">Write it here and Willy will look it over before it goes up.</p>
            <PostForm postBlog={requestBlog} request />
          </>)}
          {current === "message" && (<>
            <h1 className={heading}>Send a message</h1>
            <MessageForm />
          </>)}
          {current === "requests" && <BlogRequests />}
          {current === "college" && <CollegeHub colleges={colleges} today={today} school={school} />}
          {current === "shopping" && <ShoppingList items={shopping} />}
          {current === "backend" && <Backend />}
        </div>
      </section>
    </main>
  );
}
