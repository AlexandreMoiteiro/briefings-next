import Image from "next/image";

type SelectedAircraftCardProps = {
  name: string;
  registrations?: string;
  imageSrc?: string;
  onChange: () => void;
};

export function SelectedAircraftCard({
  name,
  registrations,
  imageSrc,
  onChange,
}: SelectedAircraftCardProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 p-2">
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt={name}
                fill
                sizes="112px"
                className="object-contain p-2"
              />
            ) : (
              <span className="text-3xl text-zinc-400" aria-hidden="true">
                ✈
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Selected aircraft
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-zinc-950">
              {name}
            </h2>
            {registrations ? (
              <p className="mt-1 truncate text-xs text-zinc-500">
                {registrations}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onChange}
          className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          Change aircraft
        </button>
      </div>
    </section>
  );
}
