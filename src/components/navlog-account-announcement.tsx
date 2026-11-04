"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "briefings:navlog-private-routes-launch:v2";

export function NavlogAccountAnnouncement() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (pathname.startsWith("/admin") || pathname.startsWith("/navlog/")) {
        setOpen(false);
        return;
      }
      try {
        if (window.localStorage.getItem(STORAGE_KEY) === "seen") {
          setOpen(false);
          return;
        }
      } catch { /* The notice remains dismissible without storage. */ }
      setOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dismissRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      previousFocus?.focus();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, "seen"); }
    catch { /* Storage is optional. */ }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/55 p-4 backdrop-blur-[2px]">
      <section role="dialog" aria-modal="true" aria-labelledby="navlog-announcement-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">New in NavLog</p>
        <h2 id="navlog-announcement-title" className="mt-2 text-xl font-semibold tracking-tight text-zinc-950">Save routes that belong to you.</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          Build your NavLog as usual, then create a free account to save it under <strong>My saved routes</strong>. Only you can reopen, edit or delete those routes.
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          <strong>Default routes</strong> remain a separate collection maintained by Briefings. Your personal changes never affect other pilots.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link href="/navlog?account=signup" onClick={dismiss}
            className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800">Create account</Link>
          <button ref={dismissRef} type="button" onClick={dismiss}
            className="rounded-xl border border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">Maybe later</button>
        </div>
      </section>
    </div>
  );
}
