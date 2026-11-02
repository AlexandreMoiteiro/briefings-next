"use client";

function roundMeters(value: number) {
  return Math.round(Number(value || 0));
}

function ComplianceCheck({ label, calculatedM, availableM }: { label: string; calculatedM: number; availableM: number }) {
  const requiredM = roundMeters(calculatedM * 1.25);
  const compliant = availableM >= requiredM;
  const marginM = roundMeters(availableM - requiredM);
  const usagePc = availableM > 0 ? (requiredM / availableM) * 100 : 100;

  return (
    <div className={["rounded-2xl border p-4", compliant ? "border-emerald-200 bg-emerald-50/70 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <span className={["rounded-full px-2.5 py-1 text-[11px] font-bold", compliant ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"].join(" ")}>
          {compliant ? "Within runway limit" : "Exceeds runway limit"}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="text-[11px] opacity-70">Required · incl. 25% margin</p><p className="text-xl font-bold tabular-nums">{requiredM} <span className="text-xs font-normal">m</span></p></div>
        <div><p className="text-[11px] opacity-70">Available runway</p><p className="text-xl font-bold tabular-nums">{roundMeters(availableM)} <span className="text-xs font-normal">m</span></p></div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10" aria-label={`${label}: ${roundMeters(usagePc)} percent of runway used`} role="img">
        <div className={["h-full rounded-full", compliant ? "bg-emerald-600" : "bg-red-600"].join(" ")} style={{ width: `${Math.min(100, Math.max(0, usagePc))}%` }} />
      </div>
      <p className="mt-2 text-xs font-semibold">{compliant ? `${marginM} m remaining` : `${Math.abs(marginM)} m short`}</p>
      <p className="mt-1 text-[11px] opacity-70">POH distance {roundMeters(calculatedM)} m × 1.25 = {requiredM} m for this check.</p>
    </div>
  );
}

export function RunwayAssessmentCard({ role, icao, runway, paFt, takeoffM, landingM, todaM, ldaM, detail }: {
  role: string;
  icao: string;
  runway: string;
  paFt: number;
  takeoffM: number;
  landingM: number;
  todaM: number;
  ldaM: number;
  detail?: string;
}) {
  const isDeparture = role === "Departure";
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{role === "Alternate" ? "Alternate 1" : role}</p>
          <h3 className="mt-1 text-lg font-semibold text-zinc-950">{icao} · RWY {runway}</h3>
          <p className="mt-1 text-xs text-zinc-500">Pressure altitude {roundMeters(paFt)} ft</p>
          {detail ? <p className="mt-1 text-xs text-zinc-500">{detail}</p> : null}
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">{isDeparture ? "Main check: takeoff" : "Main check: landing"}</span>
      </div>
      {isDeparture
        ? <ComplianceCheck label="Takeoff · TODA" calculatedM={takeoffM} availableM={todaM} />
        : <ComplianceCheck label="Landing · LDA" calculatedM={landingM} availableM={ldaM} />}
      <details className="group mt-3 rounded-xl border border-zinc-200 bg-zinc-50">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-xs font-semibold text-zinc-700">
          <span>{isDeparture ? "Also check landing at this aerodrome" : "Also check takeoff at this aerodrome"}</span>
          <span className="text-zinc-400 group-open:rotate-180">⌄</span>
        </summary>
        <div className="p-2 pt-0">{isDeparture
          ? <ComplianceCheck label="Landing · LDA" calculatedM={landingM} availableM={ldaM} />
          : <ComplianceCheck label="Takeoff · TODA" calculatedM={takeoffM} availableM={todaM} />}
        </div>
      </details>
    </div>
  );
}
