export type WorkflowStep = {
  label: string;
  description: string;
  complete: boolean;
  attention?: boolean;
};

export function WorkflowChecklist({ steps }: { steps: WorkflowStep[] }) {
  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Workflow
          </p>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            Complete each step before exporting
          </h2>
        </div>

        <p className="text-sm text-zinc-500">
          Green means ready. Amber means review before continuing.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => {
          const stateClass = step.complete
            ? "border-emerald-200 bg-emerald-50"
            : step.attention
              ? "border-amber-200 bg-amber-50"
              : "border-zinc-200 bg-zinc-50";

          const badgeClass = step.complete
            ? "bg-emerald-600 text-white"
            : step.attention
              ? "bg-amber-500 text-white"
              : "bg-zinc-200 text-zinc-600";

          return (
            <div key={step.label} className={`rounded-2xl border p-3 ${stateClass}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
                >
                  {step.complete ? "✓" : index + 1}
                </span>

                <div>
                  <p className="text-sm font-semibold text-zinc-950">{step.label}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    {step.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
