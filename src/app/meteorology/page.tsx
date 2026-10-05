const productGroups = [
  {
    title: "Aerodrome weather",
    description: "Operational text products for departure, destination and alternates.",
    products: ["METAR / SPECI", "TAF"],
    access: "AMA",
  },
  {
    title: "En-route weather",
    description: "Hazard and area information used during route preparation.",
    products: ["SIGMET", "GAMET / AIRMET"],
    access: "AMA",
  },
  {
    title: "Charts",
    description: "Graphical forecast products and upper-air information.",
    products: ["Significant weather", "Wind / temperature"],
    access: "AMA",
  },
  {
    title: "Public meteorology",
    description: "AEMET public datasets that can be evaluated for direct integration.",
    products: ["OpenData API", "Public observations / forecasts"],
    access: "OpenData",
  },
] as const;

function ExternalLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? "inline-flex items-center gap-1 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          : "inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
      }
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
        <div className="px-6 py-7 md:px-8 md:py-9">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium text-zinc-500">Meteorology</p>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
              PREVIEW
            </span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200">
              AEMET ONLY
            </span>
          </div>

          <div className="mt-5 grid gap-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
                AEMET
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-600 md:text-lg">
                First version of the meteorology module focused exclusively on
                Spain&apos;s official meteorological service. No IPMA or WAFS
                content is included in this preview.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <ExternalLink href="https://ama.aemet.es/en/" primary>
                Open Aviation AMA
              </ExternalLink>
              <ExternalLink href="https://opendata.aemet.es/">
                OpenData
              </ExternalLink>
            </div>
          </div>
        </div>

        <div className="grid gap-px bg-zinc-200 md:grid-cols-3">
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Provider
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">AEMET</p>
          </div>
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Aviation portal
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              AMA · restricted access
            </p>
          </div>
          <div className="bg-zinc-50 px-6 py-5 md:px-8">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Public data
            </p>
            <p className="mt-2 text-lg font-semibold text-zinc-950">
              AEMET OpenData
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Aviation
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                AMA
              </h2>
            </div>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              Restricted
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-600">
            The official AEMET aviation portal remains the reference for
            aviation-specific products. This preview does not attempt to bypass
            its authentication or mirror restricted content.
          </p>

          <div className="mt-6">
            <ExternalLink href="https://ama.aemet.es/en/" primary>
              Open AMA
            </ExternalLink>
          </div>
        </article>

        <article className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Public API
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
                OpenData
              </h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              Integrable
            </span>
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-600">
            This is the part we can integrate directly into Briefings where the
            required datasets are exposed by AEMET. The next technical step is
            to connect the API with an AEMET OpenData key.
          </p>

          <div className="mt-6">
            <ExternalLink href="https://opendata.aemet.es/">
              Open AEMET OpenData
            </ExternalLink>
          </div>
        </article>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-sm font-medium text-zinc-500">AEMET catalogue</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Products to organise here
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            The interface is already separated by product type so we can add
            each product only after confirming how AEMET allows it to be
            retrieved.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productGroups.map((group) => (
            <article
              key={group.title}
              className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold tracking-tight text-zinc-950">
                  {group.title}
                </h3>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold text-zinc-600">
                  {group.access}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-zinc-500">
                {group.description}
              </p>

              <div className="mt-5 space-y-2">
                {group.products.map((product) => (
                  <div
                    key={product}
                    className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm font-medium text-zinc-700"
                  >
                    {product}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-3xl border border-zinc-200 bg-zinc-950 p-6 text-white shadow-sm md:p-7">
          <p className="text-sm font-medium text-zinc-400">Implementation</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            First AEMET integration
          </h2>

          <div className="mt-6 space-y-4">
            {[
              ["1", "Connect AEMET OpenData", "Store the API key only on the Vercel server side."],
              ["2", "Inspect available datasets", "Use only products that AEMET exposes for automated retrieval."],
              ["3", "Add live product cards", "Show source, issue time and retrieval time with every product."],
              ["4", "Add cache fallback", "If AEMET is unavailable, clearly mark the last valid copy as cached."],
            ].map(([step, title, description]) => (
              <div
                key={step}
                className="grid grid-cols-[2rem_1fr] gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-950">
                  {step}
                </div>
                <div>
                  <p className="font-semibold text-white">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">
                    {description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-6 md:p-7">
          <p className="text-sm font-medium text-zinc-500">Scope</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Deliberately limited
          </h2>
          <p className="mt-4 text-sm leading-6 text-zinc-600">
            For now this branch is only about AEMET. IPMA and WAFS have been
            removed from the meteorology preview so we can get one provider
            right before adding another.
          </p>

          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Production
            </p>
            <p className="mt-2 text-sm font-semibold text-zinc-950">
              Unchanged
            </p>
            <p className="mt-1 text-sm leading-6 text-zinc-500">
              This remains a separate preview branch and deployment.
            </p>
          </div>
        </article>
      </section>
    </div>
  );
}
