"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "briefings:notam-map-launch:v1";
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
    <aside
      role="dialog"
      aria-label="New NOTAM Map"
      className="fixed inset-x-4 bottom-4 z-[80] mx-auto max-w-md rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xl sm:inset-x-auto sm:right-5 sm:mx-0"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-600">
            New · NOTAM Map
          </p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-950">
            Portuguese NOTAMs, directly on the map
          </h2>
          <p className="mt-1.5 text-sm leading-5 text-zinc-600">
            See active NOTAMs grouped and colour-coded on the aviation chart. The Portugal snapshot refreshes every 12 hours.
          </p>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          ×
        </button>
      </div>

      <div className="mt-4 flex items-center gap-2">
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
          className="rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
        >
          Not now
        </button>
      </div>
    </aside>
  );
}
