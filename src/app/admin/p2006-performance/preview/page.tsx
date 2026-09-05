import Link from "next/link";
import { P2006TCalculationPreview } from "./p2006-calculation-preview-v4";
import { P2006TAdditionalTableAudit } from "./p2006-additional-table-audit";
import { P2006TCruise3000PolicyNote } from "./p2006-cruise-3000-policy-note";

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
              Calculation and table audit
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-500">
              Review the Mass &amp; Balance path, take-off and landing interpolation,
              the proposed Performance-engine wording and the mapped Vy, Vx, OEI and
              cruise tables on their original AFM pages.
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
        <P2006TCruise3000PolicyNote />
        <P2006TAdditionalTableAudit />
      </section>
    </main>
  );
}
