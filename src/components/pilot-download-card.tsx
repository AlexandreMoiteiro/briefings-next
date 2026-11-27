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
    <section className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,1fr)] sm:items-center lg:grid-cols-[180px_minmax(220px,1fr)_minmax(220px,1fr)]">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950">
            Pilot
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-zinc-600">
            Required for {documentLabel} PDF downloads.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-zinc-700">
            Pilot name <span className="text-red-600">*</span>
          </span>
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            required
            autoComplete="name"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-zinc-950"
            placeholder="Required for download"
          />
        </label>

        <div className="text-xs leading-5 text-zinc-600 sm:col-span-2 lg:col-span-1">
          Use your real name for PDF downloads. False names may temporarily disable PDF export.
        </div>
      </div>
    </section>
  );
}
