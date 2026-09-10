type PilotDownloadCardProps = {
  value: string;
  onChange: (value: string) => void;
  documentLabel: string;
};

export function PilotDownloadCard({
  value,
  onChange,
  documentLabel,
}: PilotDownloadCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(280px,380px)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
            PDF identity
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
            Pilot
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Required for {documentLabel} PDF downloads.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Pilot name <span className="text-red-600">*</span>
          </span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            autoComplete="name"
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-zinc-950"
            placeholder="Required for download"
          />
        </label>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600">
          Use your real name. This helps keep PDF exports available to everyone and protects the service from abuse. Deliberately false names may cause PDF export access to be blocked on this device.
        </div>
      </div>
    </section>
  );
}
