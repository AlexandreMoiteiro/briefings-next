import Link from "next/link";
import { navigationItems } from "@/lib/navigation";

export default function HomePage() {
  return (
    <div className="space-y-10">
      <section className="border-b border-zinc-200 pb-8">
        <p className="mb-3 text-sm font-medium text-zinc-500">
          Flight preparation
        </p>

        <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-zinc-950 md:text-6xl">
          Briefings
        </h1>

        <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-600">
          Build briefing packages, NavLogs, performance sheets, PDF tools and
          aviation maps in one place.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {navigationItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              {item.eyebrow}
            </p>

            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">
              {item.title}
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-500">
              {item.description}
            </p>

            <p className="mt-5 text-sm font-semibold text-zinc-950">
              Abrir{" "}
              <span className="inline-block transition group-hover:translate-x-1">
                →
              </span>
            </p>
          </Link>
        ))}
      </section>
    </div>
  );
}
