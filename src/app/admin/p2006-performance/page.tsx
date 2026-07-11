import Link from "next/link";
import { P2006TPerformanceBuilder } from "./p2006-performance-builder";
import { P2006TSourceMapper } from "./p2006-source-mapper";

export default function AdminP2006PerformancePage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1600px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Admin · Tecnam P2006T
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              Guided performance builder
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
              Validate the real AFM pages beside the transcribed values, map PDF
              fields and graphical paths, and then review every interpolation step
              before approving an operational dataset.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="/api/p2006-form"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-100"
            >
              Open original P2006T PDF
            </a>
            <Link
              href="/performance"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Open Performance
            </Link>
            <Link
              href="/admin"
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Back to Admin
            </Link>
          </div>
        </header>

        <P2006TSourceMapper />
        <P2006TPerformanceBuilder />
      </section>
    </main>
  );
}
