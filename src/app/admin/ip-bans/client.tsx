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
  const [search, setSearch] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);

  async function load(){
    setError("");
    try{
      const response=await fetch("/api/admin/export-access",{cache:"no-store",credentials:"same-origin"});
      if(!response.ok)throw new Error("Não foi possível carregar os acessos.");
      const data=await response.json() as {rows:UsageEventRow[]};
      setRows(data.rows??[]);
    }catch(e){
      setRows([]);
      setError(e instanceof Error?e.message:"Erro ao carregar acessos.");
    }
  }

  useEffect(()=>{const timer = window.setTimeout(() => {void load();}, 0);return () => window.clearTimeout(timer);},[]);

  const visibleRows = useMemo(() => {
    const unique = new Map<string, UsageEventRow>();
    for (const row of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      if (row.event_type !== "navlog_export" && row.event_type !== "performance_export") continue;
      const key = `${row.client_id ?? row.id}:${row.ip_hash ?? ""}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    const needle = search.trim().toLowerCase();
    return Array.from(unique.values()).filter((row) =>
      (!onlyBlocked || row.client_banned || row.ip_banned) &&
      (!needle || [row.title, row.registration, row.client_id, row.ip_hash].some((value) => value?.toLowerCase().includes(needle)))
    );
  }, [rows, onlyBlocked, search]);

  async function updateBan(kind:"client"|"network",id:string,banned:boolean,reason:string){
    setBusyKey(kind+id);
    setError("");
    try{
      const response=await fetch("/api/admin/export-access",{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({kind,id,banned,reason})
      });
      if(!response.ok)throw new Error("Não foi possível alterar este bloqueio.");
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:"Erro ao atualizar acesso.");
    }finally{setBusyKey("");}
  }

  async function setIpBan(row:UsageEventRow,banned:boolean){
    if(!row.ip_hash)return;
    const confirmed=window.confirm(
      banned ? `Bloquear a rede associada a “${row.title??row.registration??"este registo"}”? Pode afetar outros dispositivos na mesma ligação.`
        : `Desbloquear esta rede para “${row.title??row.registration??"este registo"}”?`
    );
    if(confirmed)await updateBan("network",row.ip_hash,banned,"Admin network/IP ban: "+(row.title??row.id));
  }

  async function setClientBan(row:UsageEventRow,banned:boolean){
    if(!row.client_id)return;
    const confirmed=window.confirm(
      banned ? `Bloquear o dispositivo associado a “${row.title??row.registration??"este registo"}”?`
        : `Desbloquear este dispositivo para “${row.title??row.registration??"este registo"}”?`
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
          Acessos e bloqueios
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Gere as permissões de exportação PDF. Prefere bloquear um dispositivo específico; bloquear uma rede/IP pode afetar outros utilizadores.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
            Primeiro nível
          </p>
          <p className="mt-1 font-semibold text-red-950">Bloquear dispositivo</p>
          <p className="mt-1 text-sm leading-5 text-red-800">
            Afeta apenas aquele browser ou dispositivo. É a medida recomendada para um problema isolado.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Medida alargada
          </p>
          <p className="mt-1 font-semibold text-zinc-900">Bloquear rede/IP</p>
          <p className="mt-1 text-sm leading-5 text-zinc-600">
            Impede exportações a partir da mesma rede pública, podendo afetar outros utilizadores.
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
          {visibleRows.length} dispositivos/redes nos registos recentes
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3">
        <label htmlFor="admin-access-search" className="sr-only">Pesquisar acessos</label>
        <input id="admin-access-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar dispositivo, rede ou matrícula…" className="h-10 min-w-44 flex-1 rounded-lg border border-zinc-300 px-3 text-sm" />
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-700"><input type="checkbox" checked={onlyBlocked} onChange={(event) => setOnlyBlocked(event.target.checked)} />Só bloqueados</label>
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
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {blocked ? "Bloqueado" : "Permitido"}
                    </span>
                    {row.client_banned ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-inset ring-red-200">
                        Dispositivo bloqueado
                      </span>
                    ) : null}
                    {row.ip_banned ? (
                      <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200">
                        Rede bloqueada
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDate(row.created_at)} · {row.registration ?? "—"} · {row.aircraft_type ?? "—"}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-zinc-400">
                    dispositivo {row.client_id?.slice(0, 12) ?? "—"} · rede {row.ip_hash ? `${row.ip_hash.slice(0, 12)}…` : "não registada"}
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
                        ? "A atualizar…"
                        : row.client_banned
                          ? "Desbloquear dispositivo"
                          : "Bloquear dispositivo"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400">
                      Dispositivo não identificado
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
                        ? "A atualizar…"
                        : row.ip_banned
                          ? "Desbloquear rede/IP"
                          : "Bloquear rede/IP"}
                    </button>
                  ) : (
                    <span className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-400">
                      Rede não identificada
                    </span>
                  )}
                </div>
              </div>
            </article>
          );
        })}

        {!visibleRows.length ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
            Não há registos de exportação com estes filtros.
          </div>
        ) : null}
      </div>
    </main>
  );
}
