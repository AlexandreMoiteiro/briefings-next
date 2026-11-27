"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigationItems } from "@/lib/navigation";

const steps = navigationItems.filter(item => item.group === "workflow");

export function FlightWorkflowNav() {
  const pathname = usePathname();
  const index = steps.findIndex(step => step.href === pathname);
  if (index === -1) return null;
  const previous = steps[index-1];
  const next = steps[index+1];
  return (
    <nav aria-label="Flight preparation sequence" className="mb-5 rounded-xl border border-slate-200 bg-white p-3 sm:mb-6 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Link href="/" className="text-xs font-semibold text-sky-800 hover:underline">← Flight desk</Link>
        <span className="text-xs text-slate-500">Step {index+1} of {steps.length} · suggested order</span>
      </div>
      <ol className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {steps.map((step,i) => <li key={step.href}><Link href={step.href} aria-current={i===index ? "step" : undefined} className={"flex min-h-11 items-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold sm:gap-3 sm:px-4 sm:text-sm "+(i===index ? "border-sky-300 bg-sky-50 text-sky-950" : "border-slate-200 text-slate-600 hover:border-sky-400 hover:text-sky-900")}><span className={"flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] sm:h-7 sm:w-7 sm:text-xs "+(i===index ? "bg-[#102b46] text-white" : "bg-slate-100 text-slate-600")}>{i+1}</span><span className="min-w-0 break-words">{step.title}</span></Link></li>)}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
        {previous ? <Link href={previous.href} className="text-slate-600 hover:underline">← {previous.title}</Link> : <span/>}
        {next ? <Link href={next.href} className="text-sky-800 hover:underline">Next: {next.title} →</Link> : <Link href="/" className="text-sky-800 hover:underline">Back to flight desk →</Link>}
      </div>
    </nav>
  );
}
