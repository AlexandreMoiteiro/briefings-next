"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type FeedbackMessage = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  name: string;
  email: string | null;
  kind: "suggestion" | "question" | "issue" | "other";
  subject: string;
  message: string;
  page_url: string | null;
  status: "open" | "read" | "resolved";
};

type UnblockRequest = {
  id: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  ip_hash: string | null;
  pilot_name: string;
  message: string;
  page_url: string | null;
  status: "open" | "reviewed" | "resolved";
  client_banned: boolean;
  ip_banned: boolean;
};

type InboxItem =
  | { type: "feedback"; createdAt: string; row: FeedbackMessage }
  | { type: "unblock"; createdAt: string; row: UnblockRequest };

type View = "all" | "feedback" | "unblock";


function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function feedbackLabel(kind: FeedbackMessage["kind"]) {
  if (kind === "question") return "Question";
  if (kind === "issue") return "Problem";
  if (kind === "suggestion") return "Suggestion";
  return "Message";
}

function statusClass(status: string) {
  if (status === "open") return "bg-amber-100 text-amber-800";
  if (status === "read" || status === "reviewed") return "bg-sky-100 text-sky-800";
  return "bg-emerald-100 text-emerald-800";
}

export default function AdminMessagesPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [unblock, setUnblock] = useState<UnblockRequest[]>([]);
  const [view, setView] = useState<View>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const response=await fetch("/api/admin/messages",{credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw new Error("Unable to open messages. Sign in via Admin.");
      const result=await response.json() as {feedback:FeedbackMessage[];unblock:UnblockRequest[]};
      setFeedback(result.feedback||[]);setUnblock(result.unblock||[]);setAuthorized(true);
    }catch(e){setAuthorized(false);setError(e instanceof Error?e.message:"Unable to load messages.");}
    finally{setLoading(false);}
  }
  async function runAction(action:string,body:Record<string,unknown>){
    setBusy(action);setError("");
    try{
      const response=await fetch("/api/admin/messages",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...body})});
      if(!response.ok)throw new Error("Unable to complete the requested action.");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Action failed.");}
    finally{setBusy("");}
  }
  useEffect(()=>{void load();},[]);

  const items = useMemo<InboxItem[]>(() => {
    const merged: InboxItem[] = [
      ...feedback.map((row) => ({ type: "feedback" as const, createdAt: row.created_at, row })),
      ...unblock.map((row) => ({ type: "unblock" as const, createdAt: row.created_at, row })),
    ];

    return merged
      .filter((item) => {
        if (view !== "all" && item.type !== view) return false;
        if (showResolved) return true;
        return item.row.status !== "resolved";
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }, [feedback, unblock, view, showResolved]);

  const openFeedback = feedback.filter((row) => row.status === "open").length;
  const openUnblock = unblock.filter((row) => row.status === "open").length;

  async function setFeedbackStatus(row:FeedbackMessage,status:FeedbackMessage["status"]){
    await runAction("feedback-status",{id:row.id,status});
  }
  async function setUnblockStatus(row:UnblockRequest,status:UnblockRequest["status"]){
    await runAction("unblock-status",{id:row.id,status});
  }
  async function unblockDevice(row:UnblockRequest){
    if(!window.confirm(`Unblock the device for ${row.pilot_name}?`))return;
    await runAction("unblock-device",{id:row.id,clientId:row.client_id});
  }
  async function unblockNetwork(row:UnblockRequest){
    if(!window.confirm(`Remove the network/IP ban for ${row.pilot_name}? This can affect other devices sharing the same public IP.`))return;
    await runAction("unblock-network",{ipHash:row.ip_hash});
  }

  if (authorized === false) {
    return (
      <main className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
          Open the <Link href="/admin" className="font-semibold underline">Admin dashboard</Link> and enter the admin code first. The same secure session unlocks the inbox.
        </div>
      </main>
    );
  }

  if (authorized === null) return <p className="p-6 text-sm text-zinc-600">Loading admin messages…</p>;

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Admin inbox
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
            Messages
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            Suggestions, questions, problem reports and export unblock requests in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh inbox"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Open feedback</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950">{openFeedback}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Unblock requests</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950">{openUnblock}</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Total received</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-950">{feedback.length + unblock.length}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {([
            ["all", "All"],
            ["feedback", "Suggestions & questions"],
            ["unblock", "Unblock requests"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              className={[
                "rounded-xl px-3 py-2 text-sm font-semibold transition",
                view === value
                  ? "bg-zinc-950 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 px-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(event) => setShowResolved(event.target.checked)}
          />
          Show resolved
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-4">
        {items.map((item) => {
          if (item.type === "feedback") {
            const row = item.row;
            return (
              <article key={`feedback:${row.id}`} className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-800">
                        {feedbackLabel(row.kind)}
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}>
                        {row.status}
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold text-zinc-950">
                      {row.subject || feedbackLabel(row.kind)}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      {row.name}
                      {row.email ? (
                        <> · <a href={`mailto:${row.email}`} className="font-medium text-zinc-950 underline underline-offset-2">{row.email}</a></>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-zinc-400">{formatDate(row.created_at)}</p>
                    <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">
                      {row.message}
                    </div>
                    {row.page_url ? (
                      <p className="mt-3 break-all text-xs text-zinc-400">Related page: {row.page_url}</p>
                    ) : null}
                  </div>

                  <div className="flex min-w-44 flex-col gap-2">
                    {row.status === "open" ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void setFeedbackStatus(row, "read")}
                        className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                      >
                        Mark read
                      </button>
                    ) : null}
                    {row.status !== "resolved" ? (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void setFeedbackStatus(row, "resolved")}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Resolve
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => void setFeedbackStatus(row, "open")}
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          }

          const row = item.row;
          return (
            <article key={`unblock:${row.id}`} className="rounded-3xl border border-amber-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                      Unblock request
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                    {row.client_banned ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">Device blocked</span>
                    ) : null}
                    {row.ip_banned ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">Network blocked</span>
                    ) : null}
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-zinc-950">{row.pilot_name}</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatDate(row.created_at)} · device {row.client_id.slice(0, 12)}…
                  </p>
                  <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">
                    {row.message}
                  </div>
                  {row.page_url ? (
                    <p className="mt-3 break-all text-xs text-zinc-400">From: {row.page_url}</p>
                  ) : null}
                </div>

                <div className="flex min-w-48 flex-col gap-2">
                  {row.client_banned ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void unblockDevice(row)}
                      className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {busy === `device:${row.id}` ? "Working…" : "Unblock device"}
                    </button>
                  ) : null}
                  {row.ip_banned && row.ip_hash ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void unblockNetwork(row)}
                      className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {busy === `network:${row.id}` ? "Working…" : "Unblock network/IP"}
                    </button>
                  ) : null}
                  {row.status === "open" ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void setUnblockStatus(row, "reviewed")}
                      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                    >
                      Mark reviewed
                    </button>
                  ) : null}
                  {row.status !== "resolved" ? (
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void setUnblockStatus(row, "resolved")}
                      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Resolve without unblocking
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {!items.length ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
            No messages match this view.
          </div>
        ) : null}
      </div>
    </main>
  );
}
