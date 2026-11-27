import type { ReactNode } from "react";
type PageHeaderProps = { title: string; description?: ReactNode; action?: ReactNode; step?: number };
export function PreparationPageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 border-l-4 border-l-sky-800 bg-white px-4 py-4 sm:items-center">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-zinc-600">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
