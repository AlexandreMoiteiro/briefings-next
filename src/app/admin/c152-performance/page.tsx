import Link from "next/link";
import { C152PdfMapperV2 } from "./c152-pdf-mapper-v2";

export default function AdminC152PerformancePage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-[1700px] space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
              Admin · Cessna 152 · CS-AVC
            </p>
            <h1 className="mt-1 text-4xl font-semibold tracking-tight text-zinc-950">
              RVP.CFI.066.02 PDF field mapper
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
              The approved field map is embedded in the app. Calibrate the CG grid with consecutive
              ticks and trace the printed envelope lines; the original Sevenair PDF is loaded directly
              from the repository.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <C152PdfMapperV2 />
      </section>
    </main>
  );
}
