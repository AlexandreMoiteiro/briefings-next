"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type UsageEventRow = {
  id: string;
  created_at: string;
  client_id: string | null;
  event_type: string;
  module: string;
  title: string | null;
  aircraft_type: string | null;
  registration: string | null;
  ip_hash: string | null;
  ip_banned: boolean;
};

const ADMIN_CODE_STORAGE_KEY = "briefings_admin_usage_code";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-PT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export default function AdminIpBansPage() {
  const [adminCode, setAdminCode] = useState("");
  const [rows, setRows] = useState<UsageEventRow[]>([]);
  const [busyHash, setBusyHash] = useState("");
  const [error, setError] = useState("");

  async function load(code = adminCode) {
    if (!supabase || !code.trim()) return;

    setError("");
    const { data, error: loadError } = await supabase.rpc(
      "get_app_usage_events_admin",
      {
        p_admin_code: code.trim(),
        p_limit: 500,
      }
    );

    if (loadError) {
      setRows([]);
      setError("Could not load IP ban data. Check the admin code.");
      return;
    }

    setRows((data ?? []) as UsageEventRow[]);
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem(ADMIN_CODE_STORAGE_KEY) ?? "";
    setAdminCode(saved);
    if (saved) void load(saved);
  }, []);

  const visibleRows = useMemo(
    () => rows.filter((row) => Boolean(row.ip_hash)),
    [rows]
  );

  async function setBan(row: UsageEventRow, banned: boolean) {
    if (!supabase || !row.ip_hash || !adminCode) return;

    const action = banned ? "ban" : "unban";
    const confirmed = window.confirm(
      banned
        ? `Ban the network/IP associated with “${row.title ?? row.registration ?? "this event"}”? Future NavLog and Performance PDF exports from that IP will be blocked.`
        : `Remove the IP ban for “${row.title ?? row.registration ?? "this event"}”?`
    );
    if (!confirmed) return;

    setBusyHash(row.ip_hash);
    setError("");

    const { error: banError } = await supabase.rpc("set_app_ip_ban_admin", {
      p_admin_code: adminCode,
      p_ip_hash: row.ip_hash,
      p_banned: banned,
      p_reason: banned ? `Admin ${action}: ${row.title ?? row.id}` : null,
    });

    setBusyHash("");

    if (banError) {
      setError(`Could not ${action} this IP.`);
      return;
    }

    await load();
  }

  if (!adminCode) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Open the main Admin dashboard and enter the admin code first, then return to IP bans.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
          IP bans
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          New NavLog and Performance export events carry a one-way IP fingerprint. The raw IP address is not shown or stored here. Older events created before this protection cannot be banned retrospectively from this page.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {visibleRows.length} recent events with an IP fingerprint
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-3">
        {visibleRows.map((row) => (
          <article
            key={row.id}
            className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-semibold text-zinc-950">
                  {row.title ?? `${row.event_type} · ${row.registration ?? "—"}`}
                </p>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    row.ip_banned
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700",
                  ].join(" ")}
                >
                  {row.ip_banned ? "IP banned" : "Allowed"}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatDate(row.created_at)} · {row.registration ?? "—"} · {row.aircraft_type ?? "—"}
              </p>
              <p className="mt-1 font-mono text-[11px] text-zinc-400">
                IP fingerprint {row.ip_hash?.slice(0, 12)}… · client {row.client_id?.slice(0, 12) ?? "—"}
              </p>
            </div>

            <button
              type="button"
              disabled={busyHash === row.ip_hash}
              onClick={() => void setBan(row, !row.ip_banned)}
              className={[
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50",
                row.ip_banned
                  ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  : "bg-red-600 text-white hover:bg-red-700",
              ].join(" ")}
            >
              {busyHash === row.ip_hash
                ? "Working…"
                : row.ip_banned
                  ? "Unban IP"
                  : "Ban IP"}
            </button>
          </article>
        ))}

        {!visibleRows.length ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            No recent export events with an IP fingerprint yet.
          </div>
        ) : null}
      </div>
    </main>
  );
}
