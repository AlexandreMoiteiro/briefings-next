import Link from "next/link";
import { P2006TCalculationPreview } from "./p2006-calculation-preview-v4";

export default function P2006TCalculationPreviewPage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1800px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Admin · Tecnam P2006T
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              Calculation preview
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
              Review the mapped geometry, follow the Mass &amp; Balance path and the
              take-off or landing interpolation on the original pages, and validate
              the exact explanatory wording proposed for the Performance engine.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/p2006-performance"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Back to mapper
            </Link>
            <Link
              href="/admin"
              className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
            >
              Back to Admin
            </Link>
          </div>
        </header>

        <P2006TCalculationPreview />
      </section>
    </main>
  );
}
