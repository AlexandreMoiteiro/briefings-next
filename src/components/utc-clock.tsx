"use client";

import { useEffect, useState } from "react";

export function UtcClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <div className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-right" aria-label="Coordinated Universal Time">
    <p className="text-[10px] font-semibold uppercase tracking-widest text-sky-200">UTC / Zulu</p>
    <time dateTime={now?.toISOString()} className="font-mono text-lg font-semibold tabular-nums">{now ? now.toISOString().slice(11,16) + "Z" : "--:--Z"}</time>
    <p className="text-xs text-slate-200">{now ? now.toISOString().slice(0,10) : "UTC date"}</p>
  </div>;
}
