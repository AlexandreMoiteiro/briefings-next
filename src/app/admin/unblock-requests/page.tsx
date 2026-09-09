"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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

export default function AdminUnblockRequestsPage() {
  const [adminCode, setAdminCode] = useState("");
  const [rows, setRows] = useState<UnblockRequest[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load(code = adminCode) {
    if (!supabase || !code.trim()) return;

    setError("");
    const { data, error: loadError } = await supabase.rpc(
      "get_app_unblock_requests_admin",
      { p_admin_code: code.trim(), p_limit: 300 }
    );

    if (loadError) {
      setRows([]);
      setError("Could not load unblock requests. Check the admin code.");
      return;
    }

    setRows((data ?? []) as UnblockRequest[]);
  }

  useEffect(() => {
    const saved = window.sessionStorage.getItem(ADMIN_CODE_STORAGE_KEY) ?? "";
    setAdminCode(saved);
    if (saved) void load(saved);
  }, []);

  async function setStatus(row: UnblockRequest, status: UnblockRequest["status"]) {
    if (!supabase || !adminCode) return;
    setBusy(`status:${row.id}`);
    setError("");

    const { error: statusError } = await supabase.rpc(
      "set_app_unblock_request_status_admin",
      {
        p_admin_code: adminCode,
        p_request_id: row.id,
        p_status: status,
      }
    );

    setBusy("");
    if (statusError) {
      setError("Could not update the request status.");
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
        `Also remove the network/IP ban for ${row.pilot_name}? This affects the whole public IP.`
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
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          Open the main Admin dashboard and enter the admin code first, then return to Unblock requests.
        </div>
      </main>
    );
  }

  const openCount = rows.filter((row) => row.status === "open").length;

  return (
    <main className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Admin
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">
          Unblock requests
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Messages sent by blocked users from the PDF export popup.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {openCount} open · {rows.length} total
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-zinc-950">{row.pilot_name}</h2>
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      row.status === "open"
                        ? "bg-amber-100 text-amber-800"
                        : row.status === "reviewed"
                          ? "bg-sky-100 text-sky-800"
                          : "bg-emerald-100 text-emerald-800",
                    ].join(" ")}
                  >
                    {row.status}
                  </span>
                  {row.client_banned ? (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                      Device blocked
                    </span>
                  ) : null}
                  {row.ip_banned ? (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700">
                      Network blocked
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-zinc-500">
                  {formatDate(row.created_at)} · device {row.client_id.slice(0, 12)}
                  {row.ip_hash ? ` · network ${row.ip_hash.slice(0, 12)}…` : ""}
                </p>

                <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-800">
                  {row.message}
                </div>

                {row.page_url ? (
                  <p className="mt-3 truncate text-xs text-zinc-400">
                    From: {row.page_url}
                  </p>
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
                    onClick={() => void setStatus(row, "reviewed")}
                    className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                  >
                    Mark reviewed
                  </button>
                ) : null}

                {row.status !== "resolved" ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void setStatus(row, "resolved")}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Resolve without unblocking
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        ))}

        {!rows.length ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            No unblock requests yet.
          </div>
        ) : null}
      </div>
    </main>
  );
}
