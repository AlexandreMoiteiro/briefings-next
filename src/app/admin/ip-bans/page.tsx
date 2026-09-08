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
        ? `Ban the whole network/IP associated with “${row.title ?? row.registration ?? "this event"}”? This can also block other devices sharing the same Wi-Fi/network.`
        : `Remove the network/IP ban for “${row.title ?? row.registration ?? "this event"}”?`
    );
    if (!confirmed) return;

    setBusyKey(`ip:${row.ip_hash}`);
    setError("");

    const { error: banError } = await supabase.rpc("set_app_ip_ban_admin", {
      p_admin_code: adminCode,
      p_ip_hash: row.ip_hash,
      p_banned: banned,
      p_reason: banned ? `Admin network/IP ban: ${row.title ?? row.id}` : null,
    });

    setBusyKey("");

    if (banError) {
      setError("Could not change this network/IP ban.");
      return;
    }

    await load();
  }

  async function setClientBan(row: UsageEventRow, banned: boolean) {
    if (!supabase || !row.client_id || !adminCode) return;

    const confirmed = window.confirm(
      banned
        ? `Block the browser/device associated with “${row.title ?? row.registration ?? "this event"}”? This is the recommended first action and does not block other devices on the same network.`
        : `Remove the browser/device block for “${row.title ?? row.registration ?? "this event"}”?`
    );
    if (!confirmed) return;

    setBusyKey(`client:${row.client_id}`);
    setError("");

    const { error: banError } = await supabase.rpc("set_app_client_ban_admin", {
      p_admin_code: adminCode,
      p_client_id: row.client_id,
      p_banned: banned,
      p_reason: banned ? `Admin device/browser ban: ${row.title ?? row.id}` : null,
    });

    setBusyKey("");

    if (banError) {
      setError("Could not change this browser/device block.");
      return;
    }

    await load();
  }

  if (!adminCode) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Open the main Admin dashboard and enter the admin code first, then return to Export access.
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
          Export access
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Block the browser/device first. Use a network/IP ban only for repeated or serious abuse because it may also affect other devices sharing the same Wi-Fi or public IP.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Recommended
          </p>
          <p className="mt-1 font-semibold text-red-950">Block browser/device</p>
          <p className="mt-1 text-sm leading-5 text-red-800">
            Blocks only this saved browser/client ID. It is the safer first action for false names or abuse.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Stronger action
          </p>
          <p className="mt-1 font-semibold text-zinc-900">Block network/IP</p>
          <p className="mt-1 text-sm leading-5 text-zinc-600">
            Blocks exports from that public IP. Other users on the same network may also be affected.
          </p>
        </div>
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
                    {row.client_banned ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                        Device blocked
                      </span>
                    ) : null}
                    {row.ip_banned ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                        Network blocked
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(row.created_at)} · {row.registration ?? "—"} · {row.aircraft_type ?? "—"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-400">
                    device {row.client_id?.slice(0, 12) ?? "—"} · network {row.ip_hash ? `${row.ip_hash.slice(0, 12)}…` : "not captured (legacy)"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {row.client_id ? (
                    <button
                      type="button"
                      disabled={clientBusy}
                      onClick={() => void setClientBan(row, !row.client_banned)}
                      className={[
                        "rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50",
                        row.client_banned
                          ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "bg-red-600 text-white hover:bg-red-700",
                      ].join(" ")}
                    >
                      {clientBusy
                        ? "Working…"
                        : row.client_banned
                          ? "Unblock device"
                          : "Block device"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400">
                      Device ID unavailable
                    </span>
                  )}

                  {row.ip_hash ? (
                    <button
                      type="button"
                      disabled={ipBusy}
                      onClick={() => void setIpBan(row, !row.ip_banned)}
                      className={[
                        "rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50",
                        row.ip_banned
                          ? "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                          : "border-zinc-300 bg-zinc-50 text-zinc-700 hover:bg-zinc-100",
                      ].join(" ")}
                    >
                      {ipBusy
                        ? "Working…"
                        : row.ip_banned
                          ? "Unblock network/IP"
                          : "Block network/IP"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400">
                      Network/IP unavailable
                    </span>
                  )}
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
