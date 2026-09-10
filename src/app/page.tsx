import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

type NavItem = (typeof navigationItems)[number];

function ToolCard({ item, primary = false }: { item: NavItem; primary?: boolean }) {
  return (
    <Link
      href={item.href}
      className={[
        "group rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        primary ? "border-zinc-300" : "border-zinc-200",
      ].join(" ")}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {item.eyebrow}
      </p>
      <div className="mt-2 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950">
          {item.title}
        </h2>
        <span className="text-lg text-zinc-400 transition group-hover:translate-x-1 group-hover:text-zinc-950">
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
  const supportTools = navigationItems.slice(3);

  return (
    <div className="space-y-10">
      <section className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-8 shadow-sm sm:px-8 sm:py-10">
        <p className="text-sm font-semibold text-zinc-500">Flight preparation</p>
        <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
          Prepare the flight in one place.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">
          Build the briefing, calculate the NavLog and performance, then use the map tools when you need extra context.
        </p>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Main workflow
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Flight preparation
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {flightTools.map((item) => (
            <ToolCard key={item.href} item={item} primary />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Supporting tools
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950">
            Maps & support
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {supportTools.map((item) => (
            <ToolCard key={item.href} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
