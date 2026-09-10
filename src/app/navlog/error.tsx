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
    <section className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-500">
        NavLog error
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
        The NavLog could not be loaded.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600">
        The rest of the application is still available. Retry the NavLog without reloading the whole site.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        Retry NavLog
      </button>
    </section>
  );
}
