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
  summary: Record<string, unknown>;
  payload: Record<string, unknown>;
  user_agent: string | null;
  url: string | null;
};

const ADMIN_CODE_STORAGE_KEY = "briefings_admin_usage_code";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function getSummaryValue(
  summary: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = summary?.[key];

  if (value === null || value === undefined || value === "") return "—";

  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}

export default function AdminUsagePage() {
  const [adminCode, setAdminCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [rows, setRows] = useState<UsageEventRow[]>([]);
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadEvents(code = adminCode) {
    if (!supabase) {
      setErrorMessage("Supabase is not configured.");
      return;
    }

    if (!code.trim()) {
      setErrorMessage("Enter the admin code.");
      return;
    }

    setBusy(true);
    setErrorMessage("");

    const { data, error } = await supabase.rpc("get_app_usage_events_admin", {
      p_admin_code: code.trim(),
      p_limit: 200,
    });

    setBusy(false);

    if (error) {
      setRows([]);
      setErrorMessage("Invalid admin code or could not load usage events.");
      return;
    }

    setRows((data ?? []) as UsageEventRow[]);
    setAdminCode(code.trim());
    window.sessionStorage.setItem(ADMIN_CODE_STORAGE_KEY, code.trim());
  }

  function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadEvents(inputCode);
  }

  function handleLogout() {
    setAdminCode("");
    setInputCode("");
    setRows([]);
    window.sessionStorage.removeItem(ADMIN_CODE_STORAGE_KEY);
  }

  useEffect(() => {
    const savedCode = window.sessionStorage.getItem(ADMIN_CODE_STORAGE_KEY);

    if (savedCode) {
      setAdminCode(savedCode);
      setInputCode(savedCode);
      void loadEvents(savedCode);
    }
  }, []);

  const filteredRows = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (selectedModule !== "all" && row.module !== selectedModule) {
        return false;
      }

      if (selectedEvent !== "all" && row.event_type !== selectedEvent) {
        return false;
      }

      if (!searchText) return true;

      return [
        row.title,
        row.registration,
        row.aircraft_type,
        row.event_type,
        row.module,
        row.client_id,
        row.url,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(searchText));
    });
  }, [rows, search, selectedEvent, selectedModule]);

  const modules = useMemo(
    () => Array.from(new Set(rows.map((row) => row.module))).sort(),
    [rows]
  );

  const eventTypes = useMemo(
    () => Array.from(new Set(rows.map((row) => row.event_type))).sort(),
    [rows]
  );

  const stats = useMemo(() => {
    const navlogs = rows.filter((row) => row.event_type === "navlog_export");
    const performance = rows.filter(
      (row) => row.event_type === "performance_export"
    );
    const briefings = rows.filter(
      (row) => row.event_type === "briefing_export"
    );
    const uniqueClients = new Set(rows.map((row) => row.client_id).filter(Boolean));

    return {
      total: rows.length,
      navlogs: navlogs.length,
      performance: performance.length,
      briefings: briefings.length,
      uniqueClients: uniqueClients.size,
    };
  }, [rows]);

  if (!adminCode) {
    return (
      <main className="min-h-screen bg-zinc-50 px-6 py-16">
        <section className="mx-auto max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Usage dashboard
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Enter your admin code to view anonymous usage events created by the
            app.
          </p>

          <form onSubmit={handleUnlock} className="mt-6 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Admin code
              </span>
              <input
                value={inputCode}
                onChange={(event) => setInputCode(event.target.value)}
                type="password"
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
                placeholder="Enter admin code"
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {busy ? "Loading..." : "Open admin"}
            </button>
          </form>

          {errorMessage ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Admin
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              Usage dashboard
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Anonymous usage events from NavLog, Performance, Briefing and Area
              Map.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => loadEvents()}
              disabled={busy}
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-300"
            >
              {busy ? "Refreshing..." : "Refresh"}
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              Lock
            </button>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-5">
          {[
            ["Total events", stats.total],
            ["Unique clients", stats.uniqueClients],
            ["NavLogs", stats.navlogs],
            ["Performance", stats.performance],
            ["Briefings", stats.briefings],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {label}
              </p>
              <p className="mt-2 text-3xl font-semibold text-zinc-950">
                {value}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_220px_220px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search registration, title, client, aircraft..."
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
            />

            <select
              value={selectedModule}
              onChange={(event) => setSelectedModule(event.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
            >
              <option value="all">All modules</option>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>

            <select
              value={selectedEvent}
              onChange={(event) => setSelectedEvent(event.target.value)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-500"
            >
              <option value="all">All events</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventType}
                </option>
              ))}
            </select>
          </div>
        </section>

        {errorMessage ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <section className="space-y-4">
          {filteredRows.map((row) => (
            <article
              key={row.id}
              className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {row.module} · {row.event_type}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                    {row.title || "Untitled event"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatDate(row.created_at)} ·{" "}
                    {row.registration || "No registration"} ·{" "}
                    {row.aircraft_type || "No aircraft"}
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-500">
                  <p>
                    <strong>Client:</strong> {row.client_id || "—"}
                  </p>
                  <p className="break-all">
                    <strong>URL:</strong> {row.url || "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Waypoints
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-950">
                    {getSummaryValue(row.summary, "waypoints")}
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Distance
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-950">
                    {getSummaryValue(row.summary, "distanceNm")} NM
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    EFOB
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-950">
                    {getSummaryValue(row.summary, "finalEfobL")}
                  </p>
                </div>

                <div className="rounded-2xl bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Wind
                  </p>
                  <p className="mt-1 text-lg font-semibold text-zinc-950">
                    {getSummaryValue(row.summary, "windFrom")}/
                    {getSummaryValue(row.summary, "windKt")}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <details className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                    Summary JSON
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-white p-3 text-xs text-zinc-700">
                    {prettyJson(row.summary)}
                  </pre>
                </details>

                <details className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                    Payload JSON
                  </summary>
                  <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-white p-3 text-xs text-zinc-700">
                    {prettyJson(row.payload)}
                  </pre>
                </details>
              </div>

              <details className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                  Browser
                </summary>
                <p className="mt-3 break-all text-xs text-zinc-600">
                  {row.user_agent || "—"}
                </p>
              </details>
            </article>
          ))}

          {filteredRows.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
              No usage events found.
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
