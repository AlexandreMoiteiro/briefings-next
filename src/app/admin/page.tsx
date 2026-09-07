"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const UsageEventMap = dynamic(
  () =>
    import("./usage-event-map").then((module) => module.UsageEventMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[360px] items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        Loading event map...
      </div>
    ),
  }
);

type JsonRecord = Record<string, unknown>;

type UsageEventRow = {
  id: string;
  created_at: string;
  client_id: string | null;
  event_type: string;
  module: string;
  title: string | null;
  aircraft_type: string | null;
  registration: string | null;
  summary: JsonRecord;
  payload: JsonRecord;
  user_agent: string | null;
  url: string | null;
};

type Metric = {
  label: string;
  value: string;
  detail?: string;
};

const ADMIN_CODE_STORAGE_KEY = "briefings_admin_usage_code";
const EVENT_LIMIT = 500;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: unknown, decimals = 1, suffix = "") {
  const number = asNumber(value);

  if (number === null) return "—";

  const formatted = Number.isInteger(number)
    ? String(number)
    : number.toFixed(decimals);
  return `${formatted}${suffix}`;
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("pt-PT", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function formatDuration(value: unknown) {
  const seconds = asNumber(value);

  if (seconds === null) return "—";

  const roundedMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (!hours) return `${minutes} min`;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function eventLabel(row: UsageEventRow) {
  const labels: Record<string, string> = {
    navlog_export: "NavLog export",
    performance_export: "Performance export",
    briefing_export: "Briefing export",
    area_map_save: "Area saved",
    area_map_update: "Area updated",
    area_map_pdf_export: "Area Map PDF",
  };

  return labels[row.event_type] ?? row.event_type.replaceAll("_", " ");
}

function eventBadgeClass(eventType: string) {
  if (eventType === "navlog_export") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }

  if (eventType === "performance_export") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (eventType === "briefing_export") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }

  if (eventType.startsWith("area_map")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function metricsForEvent(row: UsageEventRow): Metric[] {
  const summary = asRecord(row.summary);

  if (row.event_type === "navlog_export") {
    return [
      {
        label: "Waypoints",
        value: formatNumber(summary.waypoints ?? summary.legs, 0),
      },
      {
        label: "Distance",
        value: formatNumber(summary.distanceNm, 1, " NM"),
      },
      {
        label: "Flight time",
        value: formatDuration(summary.timeSec),
      },
      {
        label: "Final EFOB",
        value: formatNumber(summary.finalEfobL, 1, " L"),
      },
    ];
  }

  if (row.event_type === "performance_export") {
    const sufficient = summary.fuelSufficient;

    return [
      {
        label: "Required fuel",
        value: formatNumber(summary.requiredRampFuelL, 1, " L"),
      },
      {
        label: "Fuel loaded",
        value: formatNumber(summary.totalRampFuelL, 1, " L"),
      },
      {
        label: "Extra fuel",
        value: formatNumber(summary.extraFuelL, 1, " L"),
      },
      {
        label: "Fuel status",
        value:
          typeof sufficient === "boolean"
            ? sufficient
              ? "Sufficient"
              : "Insufficient"
            : "—",
        detail: asText(summary.date, ""),
      },
    ];
  }

  if (row.event_type.startsWith("area_map")) {
    return [
      {
        label: "Areas",
        value: formatNumber(summary.areas ?? 1, 0),
      },
      {
        label: "Points",
        value: formatNumber(summary.points, 0),
      },
      {
        label: "Map source",
        value: asText(summary.mapSource, "—"),
      },
      {
        label: "Action",
        value: eventLabel(row),
      },
    ];
  }

  return [
    { label: "Module", value: row.module },
    { label: "Aircraft", value: row.aircraft_type || "—" },
    { label: "Registration", value: row.registration || "—" },
    { label: "Event", value: eventLabel(row) },
  ];
}

function hasMappablePayload(payload: JsonRecord) {
  if (asArray(payload.route).length) return true;
  if (asArray(payload.performanceResults).length) return true;
  if (asArray(payload.points).length) return true;

  return asArray(payload.areas).some((value) => {
    const area = asRecord(value);
    return asArray(area.points).length > 0;
  });
}

function PerformanceAerodromes({ payload }: { payload: JsonRecord }) {
  const rows = asArray(payload.performanceResults)
    .map((value) => {
      const result = asRecord(value);
      const leg = asRecord(result.leg);
      const aerodrome = asRecord(result.aerodrome);
      const runway = asRecord(result.bestRunway);

      if (!Object.keys(aerodrome).length && !Object.keys(leg).length) return null;

      return {
        key: `${asText(leg.role, "role")}-${asText(leg.icao, "icao")}`,
        role: asText(leg.role),
        icao: asText(leg.icao),
        name: asText(aerodrome.name),
        runway: asText(runway.id),
        headwind: formatNumber(result.headwindKt, 1, " kt"),
        crosswind: formatNumber(result.crosswindKt, 1, " kt"),
        densityAltitude: formatNumber(result.densityAltitudeFt, 0, " ft"),
        pressureAltitude: formatNumber(result.pressureAltitudeFt, 0, " ft"),
        roc: formatNumber(result.rocFpm, 0, " fpm"),
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  if (!rows.length) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <h3 className="text-sm font-semibold text-zinc-900">
          Aerodrome performance
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white text-xs uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Aerodrome</th>
              <th className="px-4 py-2">RWY</th>
              <th className="px-4 py-2">Headwind</th>
              <th className="px-4 py-2">Crosswind</th>
              <th className="px-4 py-2">DA</th>
              <th className="px-4 py-2">PA</th>
              <th className="px-4 py-2">ROC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.key} className="border-t border-zinc-100">
                <td className="px-4 py-3 font-medium text-zinc-800">
                  {item.role}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  <strong>{item.icao}</strong>
                  <span className="ml-1 text-zinc-500">{item.name}</span>
                </td>
                <td className="px-4 py-3 text-zinc-700">{item.runway}</td>
                <td className="px-4 py-3 text-zinc-700">{item.headwind}</td>
                <td className="px-4 py-3 text-zinc-700">{item.crosswind}</td>
                <td className="px-4 py-3 text-zinc-700">
                  {item.densityAltitude}
                </td>
                <td className="px-4 py-3 text-zinc-700">
                  {item.pressureAltitude}
                </td>
                <td className="px-4 py-3 text-zinc-700">{item.roc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AdminUsagePage() {
  const [adminCode, setAdminCode] = useState("");
  const [inputCode, setInputCode] = useState("");
  const [rows, setRows] = useState<UsageEventRow[]>([]);
  const [selectedModule, setSelectedModule] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedRowId, setExpandedRowId] = useState("");
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
      p_limit: EVENT_LIMIT,
    });

    setBusy(false);

    if (error) {
      setRows([]);
      setErrorMessage("Invalid admin code or could not load usage events.");
      return;
    }

    setRows(
      ((data ?? []) as UsageEventRow[]).map((row) => ({
        ...row,
        summary: asRecord(row.summary),
        payload: asRecord(row.payload),
      }))
    );
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
    setExpandedRowId("");
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
        row.summary.date,
        row.summary.mission,
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
    const count = (eventType: string) =>
      rows.filter((row) => row.event_type === eventType).length;
    const uniqueClients = new Set(rows.map((row) => row.client_id).filter(Boolean));

    return {
      total: rows.length,
      navlogs: count("navlog_export"),
      performance: count("performance_export"),
      briefings: count("briefing_export"),
      areaMap: rows.filter((row) => row.event_type.startsWith("area_map")).length,
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
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Admin
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              Usage dashboard
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Latest {EVENT_LIMIT} events from NavLog, Performance, Briefing and
              Area Map, with route and aerodrome visualisation when coordinates
              are available.
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

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Loaded events", stats.total],
            ["Unique clients", stats.uniqueClients],
            ["NavLogs", stats.navlogs],
            ["Performance", stats.performance],
            ["Briefings", stats.briefings],
            ["Area Map", stats.areaMap],
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
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_240px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search registration, title, client, aircraft, date..."
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
              <option value="all">All event types</option>
              {eventTypes.map((eventType) => (
                <option key={eventType} value={eventType}>
                  {eventLabel({ event_type: eventType } as UsageEventRow)}
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
          {filteredRows.map((row) => {
            const expanded = expandedRowId === row.id;
            const metrics = metricsForEvent(row);
            const mappable = hasMappablePayload(row.payload);

            return (
              <article
                key={row.id}
                className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm"
              >
                <div className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${eventBadgeClass(
                            row.event_type
                          )}`}
                        >
                          {eventLabel(row)}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                          {row.module}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-zinc-950">
                        {row.title || "Untitled event"}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-500">
                        {formatDate(row.created_at)} · {row.registration || "No registration"}
                        {row.aircraft_type ? ` · ${row.aircraft_type}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {mappable ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          Map available
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRowId((current) =>
                            current === row.id ? "" : row.id
                          )
                        }
                        className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                      >
                        {expanded ? "Close details" : "Open details"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {metrics.map((metric) => (
                      <div key={metric.label} className="rounded-2xl bg-zinc-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          {metric.label}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-zinc-950">
                          {metric.value}
                        </p>
                        {metric.detail ? (
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {metric.detail}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                {expanded ? (
                  <div className="space-y-4 border-t border-zinc-200 bg-zinc-50/70 p-5">
                    {mappable ? <UsageEventMap payload={row.payload} /> : null}

                    {row.event_type === "performance_export" ? (
                      <PerformanceAerodromes payload={row.payload} />
                    ) : null}

                    <div className="grid gap-3 lg:grid-cols-2">
                      <details className="rounded-2xl border border-zinc-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                          Summary JSON
                        </summary>
                        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
                          {prettyJson(row.summary)}
                        </pre>
                      </details>

                      <details className="rounded-2xl border border-zinc-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                          Payload JSON
                        </summary>
                        <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-zinc-100">
                          {prettyJson(row.payload)}
                        </pre>
                      </details>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl border border-zinc-200 bg-white p-3 text-xs leading-5 text-zinc-500">
                        <p>
                          <strong>Client:</strong> {row.client_id || "—"}
                        </p>
                        <p className="break-all">
                          <strong>URL:</strong> {row.url || "—"}
                        </p>
                      </div>

                      <details className="rounded-2xl border border-zinc-200 bg-white p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-zinc-800">
                          Browser
                        </summary>
                        <p className="mt-3 break-all text-xs text-zinc-600">
                          {row.user_agent || "—"}
                        </p>
                      </details>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}

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
