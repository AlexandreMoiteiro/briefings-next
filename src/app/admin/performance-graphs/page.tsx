import Link from "next/link";
import PerformanceGraphTools from "../performance-graph-tools";

export default function AdminPerformanceGraphsPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <section className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Admin
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              Performance graph tools
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Solver and builder for aircraft performance graph coordinate JSONs.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Back to usage admin
          </Link>
        </header>

        <PerformanceGraphTools />
      </section>
    </main>
  );
}
