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
    <section className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-50 p-2">
            {imageSrc ? (
              <Image
                src={imageSrc}
                alt={name}
                fill
                sizes="80px"
                className="object-contain p-2"
              />
            ) : (
              <span className="text-3xl text-zinc-400" aria-hidden="true">
                ✈
              </span>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-500">
              Selected aircraft
            </p>
            <h2 className="text-base font-semibold tracking-tight text-zinc-950">
              {name}
            </h2>
            {registrations ? (
              <p className="mt-0.5 break-words text-xs text-zinc-500">
                {registrations}
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onChange}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          Change aircraft
        </button>
      </div>
    </section>
  );
}
