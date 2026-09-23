"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "briefings:notam-map-launch:v2";
const START_AT = Date.parse("2026-09-23T00:00:00+01:00");
const END_AT = Date.parse("2026-09-30T23:59:59+01:00");

export function NotamMapAnnouncement() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/notam-map") || pathname.startsWith("/area-map")) {
      setOpen(false);
      return;
    }

    const now = Date.now();
    if (now < START_AT || now > END_AT) {
      setOpen(false);
      return;
    }

    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "seen") {
        setOpen(false);
        return;
      }
    } catch {
      // If storage is unavailable, showing the launch notice once per page load is acceptable.
    }

    setOpen(true);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "seen");
    } catch {
      // No-op when storage is unavailable.
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="New NOTAM Map"
        className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">
              New · NOTAM Map
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
              Portuguese NOTAMs, directly on the map
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              The new NOTAM Map plots active Portuguese and Portuguese-FIR NOTAMs on the aviation chart, grouped and colour-coded for easier scanning.
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Choose a day to see the notices applicable to that date. Always confirm the applicable NOTAM briefing before flight.
            </p>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="shrink-0 rounded-xl border border-zinc-200 px-2.5 py-1.5 text-lg leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          >
            ×
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href="/notam-map"
            onClick={dismiss}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Open NOTAM Map
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
