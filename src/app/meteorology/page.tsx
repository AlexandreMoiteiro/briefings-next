const sources = [
  {
    name: "IPMA",
    region: "Portugal",
    status: "Official source",
    statusClass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    description:
      "Portuguese meteorological products and the official aviation self-briefing entry point.",
    actions: [
      {
        label: "Open IPMA",
        href: "https://www.ipma.pt/",
      },
      {
        label: "Selfbriefing",
        href: "https://www.ipma.pt/pt/produtoseservicos/index.jsp?page=selfbriefing.xml",
      },
    ],
  },
  {
    name: "AEMET",
    region: "Spain",
    status: "Public + restricted",
    statusClass: "bg-amber-50 text-amber-700 ring-amber-200",
    description:
      "AEMET OpenData can provide public products; aviation-specific AMA products remain behind the official service.",
    actions: [
      {
        label: "OpenData",
        href: "https://opendata.aemet.es/",
      },
      {
        label: "Aviation AMA",
        href: "https://ama.aemet.es/en/",
      },
    ],
  },
  {
    name: "WAFS / AWC",
    region: "International",
    status: "Public viewer + WIFS",
    statusClass: "bg-sky-50 text-sky-700 ring-sky-200",
    description:
      "International aviation weather products, including public AWC products and the authorised WIFS service.",
    actions: [
      {
        label: "Aviation Weather",
        href: "https://aviationweather.gov/",
      },
      {
        label: "WIFS",
        href: "https://aviationweather.gov/wifs/",
      },
    ],
  },
] as const;

const statusRows = [
  {
    label: "LIVE",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    description: "Fresh product retrieved from the official source.",
  },
  {
    label: "CACHED",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    description:
      "Official source is unavailable; show the last successful product together with its retrieval time.",
  },
  {
    label: "UNAVAILABLE",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    description:
      "No safe current or cached product is available. Never silently substitute stale information.",
  },
] as const;

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}

export default function MeteorologyPage() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-6 md:px-8">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-zinc-500">Flight preparation</p>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
              PREVIEW
            </span>
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
            Meteorology
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 md:text-lg">
            A single place for the official meteorological sources used during
            flight preparation, without pretending restricted services are
            publicly accessible.
          </p>
        </div>

        <div className="grid gap-px bg-zinc-200 md:grid-cols-3">
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Sources
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              IPMA · AEMET · WAFS
            </p>
          </div>
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              First integration
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              METAR · TAF · SIGMET
            </p>
          </div>
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Resilience
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              Live · Cached · Unavailable
            </p>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-sm font-medium text-zinc-500">Official portals</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Meteorological sources
          </h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {sources.map((source) => (
            <article
              key={source.name}
              className="flex min-h-72 flex-col rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {source.region}
                  </p>
                  <h3 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                    {source.name}
                  </h3>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${source.statusClass}`}
                >
                  {source.status}
                </span>
              </div>

              <p className="mt-5 text-sm leading-6 text-zinc-600">
                {source.description}
              </p>

              <div className="mt-auto flex flex-wrap gap-2 pt-6">
                {source.actions.map((action) => (
                  <ExternalLink key={action.href} href={action.href}>
                    {action.label}
                  </ExternalLink>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-zinc-500">
                Suggested first live module
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                Airport weather
              </h2>
            </div>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
              integration pending
            </span>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
            Start with products that have a clean public data path: METAR, TAF
            and SIGMET. The page can later add radar, satellite and chart
            products only where the official source permits automated access.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {["METAR", "TAF", "SIGMET"].map((product) => (
              <div
                key={product}
                className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Product
                </p>
                <p className="mt-1 text-lg font-semibold text-zinc-950">
                  {product}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Official-data integration planned
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <ExternalLink href="https://aviationweather.gov/data/api/">
              AviationWeather.gov API
            </ExternalLink>
          </div>
        </article>

        <article className="rounded-3xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm md:p-7">
          <p className="text-sm font-medium text-zinc-400">Preview behaviour</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            Source status
          </h2>

          <div className="mt-5 space-y-3">
            {statusRows.map((row) => (
              <div
                key={row.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <span
                  className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${row.className}`}
                >
                  {row.label}
                </span>
                <p className="mt-3 text-sm leading-6 text-zinc-300">
                  {row.description}
                </p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 md:p-7">
        <p className="text-sm font-semibold text-zinc-950">
          Preview build only
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          This version is deliberately limited to the new page, navigation and
          official-source links. It does not change the production briefing
          workflow and does not yet fetch, cache or redistribute restricted
          meteorological products.
        </p>
      </section>
    </div>
  );
}
