"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

// html[data-backend] slides the top bar up and the profile sidebar left (app/globals.css).

// The boot log shown while the backend's numbers load. Pure CSS: each line rises in turn, the bar fills.
const LOG = [
  ["auth", "verifying admin session"],
  ["mongo", "connect atlas m0 · dbStats · $collStats"],
  ["aws", "freetier:GetAccountPlanState us-east-1"],
  ["aws", "freetier:GetFreeTierUsage"],
  ["visits", "aggregate last 30 days"],
  ["render", "compiling dashboard"],
];
export function Terminal({ top, leaving, onGone }: { top?: boolean; leaving?: boolean; onGone?: () => void }) {
  return (
    <div className={`backend-page bk-term fixed inset-0 ${top ? "z-50" : "z-40"} ${leaving ? "bk-leave" : ""} flex items-center justify-center p-6`} onAnimationEnd={(e) => { if (leaving && e.target === e.currentTarget) onGone?.(); }}>
      <div className="w-full max-w-2xl font-mono text-[13px] leading-7">
        <p className="text-(--bk-mute)"><span className="text-(--bk-accent)">willy@backend</span>:<span className="text-(--bk-blue)">~</span>$ ./usage --all</p>
        {LOG.map(([tag, text], i) => (
          <p key={i} className="bk-line" style={{ animationDelay: `${i * 160}ms` }}>
            <span className="text-(--bk-mute)">[{(i * 0.161).toFixed(3).padStart(7)}]</span>{" "}
            <span className="inline-block w-16 text-(--bk-accent)">{tag}</span>
            <span>{text}</span> <span className="bk-dots text-(--bk-mute)" style={{ animationDelay: `${i * 160}ms` }} />
          </p>
        ))}
        <div className="bk-line mt-3 flex items-center gap-3" style={{ animationDelay: `${LOG.length * 160}ms` }}>
          <span className="bk-spin text-(--bk-accent)" />
          <span className="relative flex-1 overflow-hidden whitespace-nowrap text-(--bk-mute)">
            {"░".repeat(48)}
            <span className="bk-bar absolute inset-y-0 left-0 overflow-hidden text-(--bk-accent)">{"█".repeat(48)}</span>
          </span>
          <span className="bk-cursor" />
        </div>
      </div>
    </div>
  );
}

// Sidebar link: on click the bars slide out and the boot log covers the wait until the dashboard arrives
export function BackendLink(props: React.ComponentProps<typeof Link>) {
  const [state, setState] = useState<"idle" | "loading" | "leaving">("idle");
  useEffect(() => {
    const done = () => setState((s) => s === "loading" ? "leaving" : s);
    addEventListener("backend-ready", done);
    return () => removeEventListener("backend-ready", done);
  }, []);
  return (<>
    <Link {...props} onClick={() => { document.documentElement.dataset.backend = ""; setState("loading"); }} />
    {/* portaled: the sliding sidebar's transform would otherwise trap a fixed overlay inside it */}
    {state !== "idle" && createPortal(<Terminal top leaving={state === "leaving"} onGone={() => setState("idle")} />, document.body)}
  </>);
}

// Rendered with the loaded dashboard: tells the link its boot log can go
export function Ready() {
  useEffect(() => { dispatchEvent(new Event("backend-ready")); }, []);
  return null;
}

// The fullscreen page: keeps the bars out while it's open, lets them slide back when it closes
export function BackendShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.dataset.backend = "";
    return () => { delete document.documentElement.dataset.backend; };
  }, []);
  return <div className="backend-page fixed inset-0 z-30 overflow-y-auto lg:overflow-hidden">{children}</div>;
}
