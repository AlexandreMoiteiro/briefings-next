"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "briefings:aemet-charts-launch:20261101";
// Preview campaign: adjust the start date when approving the production release.
const START_AT = Date.parse("2026-11-01T00:00:00Z");
const END_AT = START_AT + 7 * 24 * 60 * 60 * 1000;

export function AemetAnnouncement() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const now = Date.now();
      // Keep one modal at a time: NavLog uses account dialogs and Admin is
      // a private management workflow, so promotional notices do not belong there.
      if (["/meteorology", "/navlog", "/admin"].some((prefix) => pathname.startsWith(prefix)) || now < START_AT || now >= END_AT) {
        setOpen(false);
        return;
      }

      try {
        if (window.localStorage.getItem(STORAGE_KEY) === "seen") {
          setOpen(false);
          return;
        }
      } catch {
        // The announcement can still be shown when localStorage is disabled.
      }
      setOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, "seen"); }
    catch { /* Storage is optional. */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-[2px]">
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="AEMET Weather Charts are available"
        className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-7"
      >
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">Briefings update</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">AEMET Weather Charts are back</h2>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close announcement"
            className="shrink-0 rounded-xl border border-zinc-200 px-2.5 py-1.5 text-lg leading-none text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700">
            ×
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          In response to requests from fellow pilots, I have restored AEMET SIGWX and Wind &amp; Temperature charts in Briefings.
          They are now collected automatically, with clear UTC validity times and a simpler way to browse the available charts.
        </p>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          If you notice an error, have a suggestion, or have any questions, please use the{" "}
          <Link href="/feedback" onClick={dismiss} className="font-semibold text-zinc-900 underline underline-offset-2">Suggestions &amp; questions</Link>{" "}
          page to get in touch with me. Your feedback helps improve Briefings for everyone.
        </p>
        <p className="mt-3 text-xs text-zinc-500">Official chart source: © AEMET. Always verify the chart validity before flight.</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link href="/meteorology" onClick={dismiss}
            className="rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Explore AEMET Weather Charts
          </Link>
          <button type="button" onClick={dismiss}
            className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900">
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
