import { Suspense } from "react";
import Link from "next/link";
import { FreeTierClient, GetAccountPlanStateCommand, GetFreeTierUsageCommand } from "@aws-sdk/client-freetier";
import dbConnect from "@/lib/mongoose";
import { BackendShell, Ready, Terminal } from "./BackendLink";
import VisitsChart from "./VisitsChart";

// Admins only: site traffic and how much of each platform's free allowance the site uses, on one screen.
// Profile renders this for ?tab=backend. Visits are recorded by proxy.ts.

const MB = 1024 ** 2;
const ATLAS_M0 = 512 * MB; // Atlas counts dataSize + indexSize against the free cluster's 512 MB
const DAYS = 30;

const bytes = (n: number) => n >= MB ? `${(n / MB).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`;
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const errText = (e: unknown) => e instanceof Error ? e.message : String(e);

// One row of a meter list: name, bar, figure. Against a limit the fill turns amber at 70% and red at 90%,
// with a word so it isn't color alone. Ranked rows compare against each other, so they never warn.
function Meter({ name, used, limit, label, ranked, i = 0 }: { name: string; used: number; limit: number; label: string; ranked?: boolean; i?: number }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const [fill, track, word] = ranked ? ["bg-(--bk-blue)", "bg-(--bk-blue)/12", ""]
    : pct >= 90 ? ["bg-red-500", "bg-red-500/15", "⚠ near limit"]
    : pct >= 70 ? ["bg-amber-400", "bg-amber-400/15", "▲ getting close"]
    : ["bg-(--bk-accent)", "bg-(--bk-accent)/15", ""];
  return (
    <li className="grid grid-cols-[minmax(0,8.5rem)_1fr_auto] items-center gap-x-3 text-[13px]">
      <span className="truncate text-(--bk-mute)" title={name}>{name}</span>
      <div className={`h-1.5 rounded-full ${track}`} role="meter" aria-label={name} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} title={`${label} (${pct.toFixed(1)}%)`}>
        {/* a sliver stays visible for tiny-but-nonzero usage */}
        <div className={`bk-meter h-full rounded-full ${fill}`} style={{ width: used > 0 ? `max(${pct}%, 4px)` : 0, animationDelay: `${0.5 + i * 0.04}s` }} />
      </div>
      <span className="tabular-nums text-right">{word && <b className="mr-2 font-medium">{word}</b>}{label}</span>
    </li>
  );
}

// A note row in the same grid, for platforms with nothing metered
const Note = ({ name, text }: { name: string; text: string }) => (
  <li className="grid grid-cols-[minmax(0,8.5rem)_1fr] gap-x-3 text-[13px]"><span className="text-(--bk-mute)">{name}</span><span className="text-(--bk-mute)/80">{text}</span></li>
);

function Panel({ title, sub, className = "", d = 0, children }: { title: string; sub?: string; className?: string; d?: number; children: React.ReactNode }) {
  return (
    <section className={`bk-rise flex min-h-0 flex-col rounded-xl border border-(--bk-line) bg-(--bk-panel) p-4 ${className}`} style={{ animationDelay: `${d}s` }}>
      <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium">{title}{sub && <span className="font-mono text-xs text-(--bk-mute)">{sub}</span>}</h2>
      {children}
    </section>
  );
}

const Kpi = ({ label, value, sub, d }: { label: string; value: string; sub?: string; d: number }) => (
  <div className="bk-rise rounded-xl border border-(--bk-line) bg-(--bk-panel) px-4 py-3" style={{ animationDelay: `${d}s` }}>
    <p className="text-xs text-(--bk-mute)">{label}</p>
    <p className="text-2xl font-semibold tabular-nums">{value}{sub && <span className="ml-1.5 text-xs font-normal text-(--bk-mute)">{sub}</span>}</p>
  </div>
);

async function mongoUsage() {
  const db = (await dbConnect()).connection.db!;
  const since = new Date(Date.now() - (DAYS - 1) * 864e5).toISOString().slice(0, 10);
  const [s, list, accounts, posts, visits] = await Promise.all([
    db.stats(),
    db.listCollections().toArray(),
    db.collection("user").countDocuments(),
    db.collection("posts").countDocuments(),
    db.collection("visits").aggregate<{ day: string; views: number; visitors: number; pages?: Record<string, number> }>([
      { $match: { day: { $gte: since } } },
      { $project: { _id: 0, day: 1, views: 1, pages: 1, visitors: { $size: "$visitors" } } },
    ]).toArray(),
  ]);
  const cols = await Promise.all(list.map(async (c) => {
    const [x] = await db.collection(c.name).aggregate([{ $collStats: { storageStats: {} } }]).toArray();
    return { name: c.name, size: x.storageStats.size + x.storageStats.totalIndexSize, count: x.storageStats.count as number };
  }));
  cols.sort((a, b) => b.size - a.size);
  // every day of the window, zero where nobody came
  const byDay = new Map(visits.map((v) => [v.day, v]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const day = new Date(Date.now() - (DAYS - 1 - i) * 864e5).toISOString().slice(0, 10);
    const v = byDay.get(day);
    return { day, visitors: v?.visitors ?? 0, views: v?.views ?? 0 };
  });
  const pages: Record<string, number> = {};
  for (const v of visits) for (const [p, n] of Object.entries(v.pages ?? {})) pages[p] = (pages[p] ?? 0) + n;
  return { used: s.dataSize + s.indexSize, objects: s.objects as number, cols, accounts, posts, days, pages: Object.entries(pages).sort((a, b) => b[1] - a[1]) };
}

async function awsUsage() {
  // Billing APIs live in us-east-1. Locally the SDK uses AWS_PROFILE; on Lambda, the function's role.
  const aws = new FreeTierClient({ region: "us-east-1" });
  const [plan, usage] = await Promise.all([
    aws.send(new GetAccountPlanStateCommand({})),
    aws.send(new GetFreeTierUsageCommand({})),
  ]);
  const end = plan.accountPlanExpirationDate!;
  const start = new Date(end); start.setMonth(start.getMonth() - 6); // the Free plan lasts 6 months
  return { credits: plan.accountPlanRemainingCredits?.amount ?? 0, usages: usage.freeTierUsages ?? [], end,
    elapsed: Math.max(0, (Date.now() - +start) / 864e5), total: (+end - +start) / 864e5 };
}

async function Dashboard() {
  const [mongo, aws] = await Promise.all([
    mongoUsage().catch((e: unknown) => ({ error: errText(e) })),
    awsUsage().catch((e: unknown) => ({ error: errText(e) })),
  ]);
  const m = "error" in mongo ? null : mongo, a = "error" in aws ? null : aws;
  const today = m?.days.at(-1);
  const failed = (what: string, e: { error: string }) => <p className="text-[13px] text-red-400">{what}: {e.error}</p>;

  return (<>
    <Ready />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Kpi d={0.35} label="Visitors today" value={m ? num(today!.visitors) : "—"} />
      <Kpi d={0.4} label="Page views today" value={m ? num(today!.views) : "—"} />
      <Kpi d={0.45} label={`Page views · ${DAYS}d`} value={m ? num(m.days.reduce((t, d) => t + d.views, 0)) : "—"} />
      <Kpi d={0.5} label="Accounts" value={m ? num(m.accounts) : "—"} sub={m ? `${m.posts} posts` : undefined} />
      <Kpi d={0.55} label="AWS credits left" value={a ? `$${num(a.credits)}` : "—"} sub={a ? `${Math.round(a.total - a.elapsed)} days of free plan` : undefined} />
    </div>

    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
      <Panel title="Traffic" sub={`last ${DAYS} days · UTC`} className="lg:col-span-2" d={0.45}>
        {m ? <VisitsChart data={m.days} /> : failed("mongo", mongo as { error: string })}
      </Panel>
      <Panel title="Free limits" sub="used / allowance" d={0.5}>
        <ul className="flex flex-col gap-3">
          {m && <Meter name="Atlas storage" used={m.used} limit={ATLAS_M0} label={`${bytes(m.used)} / 512 MB`} />}
          {a && <Meter name="AWS free plan" used={a.elapsed} limit={a.total} label={`ends ${a.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`} i={1} />}
          {a?.usages.map((u, i) => (
            <Meter key={i} i={i + 2} name={`${u.service} ${u.usageType ?? ""}`} used={u.actualUsageAmount ?? 0} limit={u.limit ?? 0}
              label={`${num(u.actualUsageAmount ?? 0)} / ${num(u.limit ?? 0)} ${u.unit ?? ""}`} />
          ))}
          {a && !a.usages.length && <Note name="AWS free tier" text="AWS hasn't reported any metered usage yet" />}
          {/* ponytail: nothing to measure yet; wire up their APIs once they carry traffic */}
          <Note name="Cloudflare" text="free DNS has no usage cap" />
          <Note name="Oracle VM" text="fixed Always Free allocation · 10 TB/mo egress" />
        </ul>
        {!m && failed("mongo", mongo as { error: string })}
        {!a && failed("aws", aws as { error: string })}
      </Panel>
    </div>

    <div className="grid gap-3 lg:h-[30%] lg:grid-cols-3">
      <Panel title="MongoDB collections" sub={m ? `${num(m.objects)} docs · ranked by size` : undefined} className="lg:col-span-2" d={0.55}>
        {/* ranked bars against the biggest collection, so small ones are still comparable */}
        {m && <ul className="grid min-h-0 grid-flow-col grid-rows-6 gap-x-6 gap-y-1.5 overflow-hidden">
          {m.cols.map((c, i) => <Meter key={c.name} i={i} ranked name={c.name} used={c.size} limit={m.cols[0].size} label={`${bytes(c.size)} · ${num(c.count)}`} />)}
        </ul>}
      </Panel>
      <Panel title="Top pages" sub={`${DAYS}d views`} d={0.6}>
        {m && (m.pages.length
          ? <ul className="flex min-h-0 flex-col gap-1.5 overflow-hidden">{m.pages.slice(0, 6).map(([p, n], i) => <Meter key={p} i={i} ranked name={p} used={n} limit={m.pages[0][1]} label={num(n)} />)}</ul>
          : <p className="text-[13px] text-(--bk-mute)">No visits recorded yet.</p>)}
      </Panel>
    </div>
  </>);
}

export default function Backend() {
  return (
    <BackendShell>
      <div className="flex min-h-full flex-col gap-3 p-4 lg:h-full lg:p-6">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-sm"><span className="text-(--bk-accent)">willy.work</span><span className="text-(--bk-mute)"> / </span>backend</h1>
          <Link href="/profile" className="rounded-lg border border-(--bk-line) px-3 py-1.5 text-sm text-(--bk-mute) hover:bg-(--bk-raised) hover:text-(--bk-text)">← Back</Link>
        </div>
        <Suspense fallback={<Terminal />}><Dashboard /></Suspense>
      </div>
    </BackendShell>
  );
}
