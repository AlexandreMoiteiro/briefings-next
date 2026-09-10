import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

type NavItem = (typeof navigationItems)[number];

function ToolCard({ item, index }: { item: NavItem; index?: number }) {
  return (
    <Link
      href={item.href}
      className="group rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-400 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {typeof index === "number" ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-xs font-semibold text-white">
                {index}
              </span>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {item.eyebrow}
            </p>
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-950">
            {item.title}
          </h2>
        </div>
        <span className="text-lg text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-950">
          →
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-600">{item.description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {item.details.map((detail) => (
          <span
            key={detail}
            className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600"
          >
            {detail}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const flightTools = navigationItems.slice(0, 3);
  const mapTools = navigationItems.slice(3);

  return (
    <div className="space-y-10">
      <header className="border-b border-zinc-200 pb-7">
        <p className="text-sm font-semibold text-zinc-500">Flight preparation</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
          Briefings
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 sm:text-lg">
          Briefing, navigation, aircraft performance and map tools.
        </p>
      </header>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Flight workflow
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {flightTools.map((item, index) => (
            <ToolCard key={item.href} item={item} index={index + 1} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Maps
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {mapTools.map((item) => (
            <ToolCard key={item.href} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
