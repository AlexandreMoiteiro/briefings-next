"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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

const ADMIN_CODE_STORAGE_KEY = "briefings_admin_usage_code";

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
  const [adminCode, setAdminCode] = useState("");
  const [feedback, setFeedback] = useState<FeedbackMessage[]>([]);
  const [unblock, setUnblock] = useState<UnblockRequest[]>([]);
  const [view, setView] = useState<View>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load(code = adminCode) {
    if (!supabase || !code.trim()) return;

    setLoading(true);
    setError("");

    const [feedbackResult, unblockResult] = await Promise.all([
      supabase.rpc("get_app_feedback_messages_admin", {
        p_admin_code: code.trim(),
        p_limit: 300,
      }),
      supabase.rpc("get_app_unblock_requests_admin", {
        p_admin_code: code.trim(),
        p_limit: 300,
      }),
    ]);

    setLoading(false);

    if (feedbackResult.error || unblockResult.error) {
      setFeedback([]);
      setUnblock([]);
      setError("Could not load the Admin inbox. Check the admin code.");
      return;
    }

    setFeedback((feedbackResult.data ?? []) as FeedbackMessage[]);
    setUnblock((unblockResult.data ?? []) as UnblockRequest[]);
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem(ADMIN_CODE_STORAGE_KEY) ?? "";
    setAdminCode(saved);
    if (saved) void load(saved);
  }, []);

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

  async function setFeedbackStatus(
    row: FeedbackMessage,
    status: FeedbackMessage["status"]
  ) {
    if (!supabase || !adminCode) return;
    setBusy(`feedback:${row.id}`);
    setError("");

    const { error: updateError } = await supabase.rpc(
      "set_app_feedback_message_status_admin",
      {
        p_admin_code: adminCode,
        p_message_id: row.id,
        p_status: status,
      }
    );

    setBusy("");
    if (updateError) {
      setError("Could not update the message status.");
      return;
    }
    await load();
  }

  async function setUnblockStatus(
    row: UnblockRequest,
    status: UnblockRequest["status"]
  ) {
    if (!supabase || !adminCode) return;
    setBusy(`unblock-status:${row.id}`);
    setError("");

    const { error: updateError } = await supabase.rpc(
      "set_app_unblock_request_status_admin",
      {
        p_admin_code: adminCode,
        p_request_id: row.id,
        p_status: status,
      }
    );

    setBusy("");
    if (updateError) {
      setError("Could not update the unblock request.");
      return;
    }
    await load();
  }

  async function unblockDevice(row: UnblockRequest) {
    if (!supabase || !adminCode || !row.client_id) return;
    if (!window.confirm(`Unblock the device for ${row.pilot_name}?`)) return;

    setBusy(`device:${row.id}`);
    setError("");

    const { error: unblockError } = await supabase.rpc("set_app_client_ban_admin", {
      p_admin_code: adminCode,
      p_client_id: row.client_id,
      p_banned: false,
      p_reason: null,
    });

    if (unblockError) {
      setBusy("");
      setError("Could not unblock the device.");
      return;
    }

    await supabase.rpc("set_app_unblock_request_status_admin", {
      p_admin_code: adminCode,
      p_request_id: row.id,
      p_status: "resolved",
    });

    setBusy("");
    await load();
  }

  async function unblockNetwork(row: UnblockRequest) {
    if (!supabase || !adminCode || !row.ip_hash) return;
    if (
      !window.confirm(
        `Remove the network/IP ban for ${row.pilot_name}? This can affect other devices sharing the same public IP.`
      )
    ) {
      return;
    }

    setBusy(`network:${row.id}`);
    setError("");

    const { error: unblockError } = await supabase.rpc("set_app_ip_ban_admin", {
      p_admin_code: adminCode,
      p_ip_hash: row.ip_hash,
      p_banned: false,
      p_reason: null,
    });

    setBusy("");
    if (unblockError) {
      setError("Could not unblock the network/IP.");
      return;
    }
    await load();
  }

  if (!adminCode) {
    return (
      <main className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
          Open the <Link href="/admin" className="font-semibold underline">Admin dashboard</Link> and enter the admin code first. The same session unlocks the inbox.
        </div>
      </main>
    );
  }

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
