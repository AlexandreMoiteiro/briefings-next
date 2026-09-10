"use client";

type AircraftChoice<T extends string> = {
  value: T;
  name: string;
  registrations?: string;
  imageSrc?: string;
  imageAlt?: string;
  badge?: string;
};

type AircraftPickerProps<T extends string> = {
  title: string;
  choices: readonly AircraftChoice<T>[];
  onSelect: (value: T) => void;
};

function GenericAircraftArtwork() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full border border-zinc-200 bg-white text-5xl text-zinc-400 shadow-sm">
        ✈
      </div>
    </div>
  );
}

export function AircraftPicker<T extends string>({
  title,
  choices,
  onSelect,
}: AircraftPickerProps<T>) {
  return (
    <div className="space-y-6">
      <header className="border-b border-zinc-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          {title}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
          Choose aircraft
        </h1>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => onSelect(choice.value)}
            className="group overflow-hidden rounded-3xl border border-zinc-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          >
            <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-zinc-100 bg-gradient-to-b from-white to-zinc-50 p-5">
              {choice.badge ? (
                <span className="absolute right-3 top-3 rounded-full border border-zinc-200 bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500 backdrop-blur">
                  {choice.badge}
                </span>
              ) : null}
              {choice.imageSrc ? (
                <img
                  src={choice.imageSrc}
                  alt={choice.imageAlt || choice.name}
                  className="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-[1.02]"
                />
              ) : (
                <GenericAircraftArtwork />
              )}
            </div>

            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
                  {choice.name}
                </h2>
                <span className="text-lg text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">
                  →
                </span>
              </div>
              {choice.registrations ? (
                <p className="mt-2 text-xs leading-5 text-zinc-500">
                  {choice.registrations}
                </p>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export type { AircraftChoice };
