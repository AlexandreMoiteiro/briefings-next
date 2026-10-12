"use client";

import { useEffect, useMemo, useState } from "react";

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

export function AdminIpBansClient() {
  const [rows, setRows] = useState<UsageEventRow[]>([]);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");

  async function load(){
    setError("");
    try{
      const response=await fetch("/api/admin/export-access",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Unable to load export access.");
      const data=await response.json() as {rows:UsageEventRow[]};
      setRows(data.rows??[]);
    }catch(e){
      setRows([]);
      setError(e instanceof Error?e.message:"Unable to load export access.");
    }
  }

  useEffect(()=>{void load();},[]);

  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.event_type === "navlog_export" ||
          row.event_type === "performance_export"
      ),
    [rows]
  );

  async function updateBan(kind:"client"|"network",id:string,banned:boolean,reason:string){
    setBusyKey(kind+id);
    setError("");
    try{
      const response=await fetch("/api/admin/export-access",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({kind,id,banned,reason})
      });
      if(!response.ok)throw new Error("Could not update this export restriction.");
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:"Could not update export access.");
    }finally{setBusyKey("");}
  }

  async function setIpBan(row:UsageEventRow,banned:boolean){
    if(!row.ip_hash)return;
    const confirmed=window.confirm(
      banned ? `Block the whole network associated with “${row.title??row.registration??"this event"}”? This can affect other devices sharing the same Wi-Fi.`
        : `Unblock this network for “${row.title??row.registration??"this event"}”?`
    );
    if(confirmed)await updateBan("network",row.ip_hash,banned,"Admin network/IP ban: "+(row.title??row.id));
  }

  async function setClientBan(row:UsageEventRow,banned:boolean){
    if(!row.client_id)return;
    const confirmed=window.confirm(
      banned ? `Block the browser/device associated with “${row.title??row.registration??"this event"}”?`
        : `Unblock this browser/device for “${row.title??row.registration??"this event"}”?`
    );
    if(confirmed)await updateBan("client",row.client_id,banned,"Admin device/browser ban: "+(row.title??row.id));
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
          const ipBusy = row.ip_hash ? busyKey === `network${row.ip_hash}` : false;
          const clientBusy = row.client_id
            ? busyKey === `client${row.client_id}`
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
