"use client";

import { useEffect } from "react";

export default function NavlogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("NavLog route error", error);
  }, [error]);

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-red-500">
        NavLog error
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
        The NavLog could not be loaded.
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
        The error is isolated to this page, so the rest of Briefings remains available.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        Retry NavLog
      </button>
    </section>
  );
}
