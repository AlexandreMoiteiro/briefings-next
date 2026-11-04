"use client";

import type { PerfectRouteWaypointRaw } from "@/lib/navlog-saved-routes";

const fieldClass = "mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-950 outline-none focus:border-sky-600";

export function AdminWaypointInspector({ waypoint, index, onChange, onAlternateChange }: {
  waypoint: PerfectRouteWaypointRaw;
  index: number;
  onChange: (changes: Partial<PerfectRouteWaypointRaw>) => void;
  onAlternateChange: (checked: boolean) => void;
}) {
  const numberValue = (value: string) => value === "" ? Number.NaN : Number(value);
  return (
    <section className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-5" aria-label={`Editar ponto ${index + 1}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Ponto selecionado · {index + 1}</p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-zinc-950">{waypoint.code || "Novo ponto"}</h3>
          <p className="mt-1 text-xs text-zinc-500">Edita os dados abaixo ou arrasta o marcador no mapa.</p>
        </div>
        {waypoint.alternate_marker ? <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Destino / alternante</span> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-zinc-700">Código / ICAO
          <input value={waypoint.code ?? ""} maxLength={16} onChange={(event) => onChange({ code: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-zinc-700">Nome do ponto
          <input value={waypoint.name ?? ""} onChange={(event) => onChange({ name: event.target.value })} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-zinc-700">Latitude (graus decimais)
          <input type="number" step="any" min={-90} max={90} value={Number.isFinite(waypoint.lat) ? waypoint.lat : ""} onChange={(event) => onChange({ lat: numberValue(event.target.value) })} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-zinc-700">Longitude (graus decimais)
          <input type="number" step="any" min={-180} max={180} value={Number.isFinite(waypoint.lon) ? waypoint.lon : ""} onChange={(event) => onChange({ lon: numberValue(event.target.value) })} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-zinc-700">Altitude (ft)
          <input type="number" min={0} max={60000} step={100} value={waypoint.alt ?? ""} onChange={(event) => onChange({ alt: event.target.value === "" ? undefined : Number(event.target.value) })} className={fieldClass} />
        </label>
        <label className="text-xs font-semibold text-zinc-700">Tipo de ponto
          <select value={waypoint.src ?? "VFR"} onChange={(event) => onChange({ src: event.target.value })} className={fieldClass}>
            <option value="VFR">VFR</option><option value="IFR">IFR</option><option value="AD">Aeródromo</option><option value="VOR">VOR</option><option value="PROC">Procedimento</option>
          </select>
        </label>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-700">Paragem e vento deste troço</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-semibold text-zinc-600">Tempo sobre o ponto (min)
            <input type="number" min={0} max={1440} value={waypoint.stop_min ?? 0} onChange={(event) => onChange({ stop_min: Math.max(0, Number(event.target.value)) })} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">Vento de (°)
            <input type="number" min={0} max={360} placeholder="Global" value={waypoint.wind_from ?? ""} onChange={(event) => onChange({ wind_from: event.target.value === "" ? null : Number(event.target.value) })} className={fieldClass} />
          </label>
          <label className="text-xs font-semibold text-zinc-600">Vento (kt)
            <input type="number" min={0} max={200} placeholder="Global" value={waypoint.wind_kt ?? ""} onChange={(event) => onChange({ wind_kt: event.target.value === "" ? null : Number(event.target.value) })} className={fieldClass} />
          </label>
        </div>
      </div>
      <label className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 text-sm font-semibold text-zinc-800">
        <input type="checkbox" checked={waypoint.alternate_marker === true} onChange={(event) => onAlternateChange(event.target.checked)} className="size-4 accent-zinc-900" />
        Start alternate
      </label>
      <label className="block text-xs font-semibold text-zinc-700">Notas do ponto
        <textarea value={waypoint.remarks ?? ""} onChange={(event) => onChange({ remarks: event.target.value })} rows={2} className={`${fieldClass} resize-y`} />
      </label>
      <details className="rounded-xl border border-zinc-200 p-4 text-xs text-zinc-700">
        <summary className="cursor-pointer font-semibold">VOR, procedimentos e opções avançadas</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">VOR
            <select value={waypoint.vor_pref ?? "AUTO"} onChange={(event) => onChange({ vor_pref: event.target.value })} className={fieldClass}>
              <option value="AUTO">Automático</option><option value="FIXED">Fixo</option>
            </select>
          </label>
          <label className="text-xs font-semibold">Identificador VOR
            <input value={waypoint.vor_ident ?? ""} onChange={(event) => onChange({ vor_ident: event.target.value.toUpperCase() })} className={fieldClass} />
          </label>
          <label className="sm:col-span-2 text-xs font-semibold">Rotas / procedimento associado
            <input value={waypoint.routes ?? ""} onChange={(event) => onChange({ routes: event.target.value })} className={fieldClass} />
          </label>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={waypoint.suppress_auto_vertical === true} onChange={(event) => onChange({ suppress_auto_vertical: event.target.checked })} className="size-4 accent-zinc-900" />
            Desativar perfil vertical automático neste ponto
          </label>
        </div>
      </details>
    </section>
  );
}
