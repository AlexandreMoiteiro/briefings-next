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
  title?: string;
  choices: readonly AircraftChoice<T>[];
  onSelect: (value: T) => void;
};

function GenericAircraftArtwork() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-200 bg-white text-3xl text-zinc-400 shadow-sm">
        ✈
      </div>
    </div>
  );
}

export function AircraftPicker<T extends string>({
  title = "Choose aircraft",
  choices,
  onSelect,
}: AircraftPickerProps<T>) {
  const centerFinalChoice = choices.length % 4 === 1;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-950">
          {title}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {choices.map((choice, index) => {
          const isCenteredLast = centerFinalChoice && index === choices.length - 1;

          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => onSelect(choice.value)}
              className={[
                "group overflow-hidden rounded-xl border border-zinc-200 bg-white text-left transition hover:border-sky-500 hover:bg-sky-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 sm:col-span-2 xl:col-span-2",
                isCenteredLast ? "sm:col-start-2 xl:col-start-4" : "",
              ].join(" ")}
            >
              <div className="relative flex h-24 sm:h-32 items-center justify-center overflow-hidden border-b border-zinc-100 bg-zinc-50 p-3">
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

              <div className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-950 sm:text-base">
                    {choice.name}
                  </h3>
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
          );
        })}
      </div>
    </section>
  );
}

export type { AircraftChoice };
