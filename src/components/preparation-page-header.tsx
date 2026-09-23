import type { ReactNode } from "react";

type PreparationPageHeaderProps = {
  step: number;
  title: string;
  description: string;
  action?: ReactNode;
};

export function PreparationPageHeader({
  step,
  title,
  description,
  action,
}: PreparationPageHeaderProps) {
  return (
    <header className="border-b border-zinc-200 pb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Flight preparation · Step {step}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 sm:text-base">
            {description}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}
