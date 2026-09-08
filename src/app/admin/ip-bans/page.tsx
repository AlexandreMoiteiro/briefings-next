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
  client_banned: boolean;
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
  const [busyKey, setBusyKey] = useState("");
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
      setError("Could not load ban data. Check the admin code.");
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
    () =>
      rows.filter(
        (row) =>
          row.event_type === "navlog_export" ||
          row.event_type === "performance_export"
      ),
    [rows]
  );

  async function setIpBan(row: UsageEventRow, banned: boolean) {
    if (!supabase || !row.ip_hash || !adminCode) return;

    const confirmed = window.confirm(
      banned
        ? `Ban the network/IP associated with “${row.title ?? row.registration ?? "this event"}”? Future NavLog and Performance PDF exports from that IP will be blocked.`
        : `Remove the IP ban for “${row.title ?? row.registration ?? "this event"}”?`
    );
    if (!confirmed) return;

    setBusyKey(`ip:${row.ip_hash}`);
    setError("");

    const { error: banError } = await supabase.rpc("set_app_ip_ban_admin", {
      p_admin_code: adminCode,
      p_ip_hash: row.ip_hash,
      p_banned: banned,
      p_reason: banned ? `Admin IP ban: ${row.title ?? row.id}` : null,
    });

    setBusyKey("");

    if (banError) {
      setError("Could not change this IP ban.");
      return;
    }

    await load();
  }

  async function setClientBan(row: UsageEventRow, banned: boolean) {
    if (!supabase || !row.client_id || !adminCode) return;

    const confirmed = window.confirm(
      banned
        ? `Ban the browser/client associated with “${row.title ?? row.registration ?? "this event"}”? This is useful for older events that do not have an IP fingerprint.`
        : `Remove the client ban for “${row.title ?? row.registration ?? "this event"}”?`
    );
    if (!confirmed) return;

    setBusyKey(`client:${row.client_id}`);
    setError("");

    const { error: banError } = await supabase.rpc("set_app_client_ban_admin", {
      p_admin_code: adminCode,
      p_client_id: row.client_id,
      p_banned: banned,
      p_reason: banned ? `Admin client ban: ${row.title ?? row.id}` : null,
    });

    setBusyKey("");

    if (banError) {
      setError("Could not change this client ban.");
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
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
          Export bans
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          New exports carry a one-way IP fingerprint, so you can ban that network/IP without storing the raw address. Older events can still be blocked by client/browser ID.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {visibleRows.length} recent NavLog / Performance export events
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
        {visibleRows.map((row) => {
          const blocked = row.ip_banned || row.client_banned;
          const ipBusy = row.ip_hash ? busyKey === `ip:${row.ip_hash}` : false;
          const clientBusy = row.client_id
            ? busyKey === `client:${row.client_id}`
            : false;

          return (
            <article
              key={row.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-zinc-950">
                      {row.title ?? `${row.event_type} · ${row.registration ?? "—"}`}
                    </p>
                    <span
                      className={[
                        "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        blocked
                          ? "bg-red-100 text-red-700"
                          : "bg-emerald-100 text-emerald-700",
                      ].join(" ")}
                    >
                      {blocked ? "Blocked" : "Allowed"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(row.created_at)} · {row.registration ?? "—"} · {row.aircraft_type ?? "—"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-400">
                    IP {row.ip_hash ? `${row.ip_hash.slice(0, 12)}…` : "not captured (legacy)"} · client {row.client_id?.slice(0, 12) ?? "—"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.ip_hash ? (
                    <button
                      type="button"
                      disabled={ipBusy}
                      onClick={() => void setIpBan(row, !row.ip_banned)}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50",
                        row.ip_banned
                          ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "bg-red-600 text-white hover:bg-red-700",
                      ].join(" ")}
                    >
                      {ipBusy ? "Working…" : row.ip_banned ? "Unban IP" : "Ban IP"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400">
                      IP unavailable
                    </span>
                  )}

                  {row.client_id ? (
                    <button
                      type="button"
                      disabled={clientBusy}
                      onClick={() => void setClientBan(row, !row.client_banned)}
                      className={[
                        "rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50",
                        row.client_banned
                          ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
                      ].join(" ")}
                    >
                      {clientBusy
                        ? "Working…"
                        : row.client_banned
                          ? "Unban client"
                          : "Ban client"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {!visibleRows.length ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            No recent NavLog or Performance export events.
          </div>
        ) : null}
      </div>
    </main>
  );
}
