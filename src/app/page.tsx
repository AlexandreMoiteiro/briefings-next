import Link from "next/link";
import { navigationItems } from "@/lib/navigation";
import { UtcClock } from "@/components/utc-clock";

type Tool = (typeof navigationItems)[number];

const icons: Record<string, React.ReactNode> = {
  "/performance": <><path d="M12 3v18M5 6h14M4 9l-3 6h6L4 9Zm16 0-3 6h6l-3-6ZM8 21h8"/></>,
  "/navlog": <><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="m7 17 4-4-2-4 4-4h4"/></>,
  "/briefing": <><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/></>,
  "/meteorology": <><path d="M4 14a5 5 0 0 1 1-9 7 7 0 0 1 13 3 4 4 0 0 1 0 8H7M3 19h12M7 22h10"/></>,
  "/notam-map": <><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/></>,
  "/vfr-map": <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16"/></>,
};

const labels: Record<string, string> = {
  "/performance": "Aircraft & loading",
  "/navlog": "Route & fuel",
  "/briefing": "Documents & export",
  "/meteorology": "Weather charts",
  "/notam-map": "Airspace notices",
  "/vfr-map": "Chart & navigation",
};

function ToolIcon({ href }: { href: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">{icons[href]}</svg>;
}

function Arrow() {
  return <span aria-hidden="true" className="text-xl transition-transform group-hover:translate-x-1 motion-reduce:transform-none">→</span>;
}

function WorkflowCard({ item, step }: { item: Tool; step: number }) {
  return (
    <Link href={item.href} className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-sky-400 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-800"><ToolIcon href={item.href}/></span>
        <span className="font-mono text-xs font-semibold text-slate-500">0{step} / 03</span>
      </div>
      <p className="mt-5 text-xs font-medium text-slate-500">{labels[item.href]}</p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{item.title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-sm font-semibold text-sky-800"><span>Open {item.title}</span><Arrow/></div>
    </Link>
  );
}

function ReferenceCard({ item }: { item: Tool }) {
  return (
    <Link href={item.href} className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:border-sky-400 sm:p-5">
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><ToolIcon href={item.href}/></span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-slate-950">{item.title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">{labels[item.href]}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{item.details.join(" · ")}</p>
      </div>
      <span className="text-sky-800"><Arrow/></span>
    </Link>
  );
}

export default function HomePage() {
  const workflow = navigationItems.filter(item => item.group === "workflow");
  const references = [...navigationItems.filter(item => item.group === "utility")].sort((a,b) => Number(b.href === "/meteorology") - Number(a.href === "/meteorology"));
  return (
    <div className="space-y-8 sm:space-y-10">
      <header className="relative isolate overflow-hidden rounded-3xl bg-[#102b46] px-6 py-8 text-white sm:px-10 sm:py-11">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-20" style={{backgroundImage:"linear-gradient(rgba(180,215,240,.2) 1px,transparent 1px),linear-gradient(90deg,rgba(180,215,240,.2) 1px,transparent 1px)",backgroundSize:"40px 40px"}}/>
        <svg aria-hidden="true" viewBox="0 0 440 250" className="pointer-events-none absolute -right-8 bottom-0 -z-10 hidden h-full w-auto text-sky-200 opacity-25 md:block" fill="none" stroke="currentColor">
          <circle cx="295" cy="125" r="110"/><circle cx="295" cy="125" r="77"/><circle cx="295" cy="125" r="44"/><path d="M295 0v250M170 125h250" strokeDasharray="3 6"/><path d="M44 228 150 169 210 187 295 125 380 36" strokeWidth="2" strokeDasharray="7 6"/><circle cx="150" cy="169" r="5" fill="currentColor"/><circle cx="210" cy="187" r="5" fill="currentColor"/><circle cx="295" cy="125" r="5" fill="currentColor"/><path d="m369 38 12-12 3 17" strokeWidth="2"/>
        </svg>
        <div className="flex flex-wrap items-start justify-between gap-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Briefings / Flight desk</p>
          <UtcClock/>
        </div>
        <h1 className="mt-5 max-w-xl text-3xl font-semibold tracking-tight sm:text-5xl">Plan your flight.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200 sm:text-base">Review conditions, prepare your aircraft and route, and assemble your final briefing in one place.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/performance" className="group inline-flex min-h-11 items-center gap-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#102b46] hover:bg-sky-100">Open Performance <Arrow/></Link>
          <Link href="/navlog" className="inline-flex min-h-11 items-center rounded-xl border border-white/35 bg-white/5 px-5 py-3 text-sm font-semibold hover:bg-white/15">Open NavLog</Link>
        </div>
      </header>

      <section aria-labelledby="reference-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-800">Flight information</p><h2 id="reference-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Review the conditions</h2></div>
          <p className="text-sm text-slate-500">Consult before and during planning.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">{references.map(item => <ReferenceCard key={item.href} item={item}/>)}</div>
      </section>

      <section aria-labelledby="workflow-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-sky-800">Preparation</p><h2 id="workflow-heading" className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">Your flight workflow</h2></div>
          <p className="text-sm text-slate-500">Suggested order · revisit any step.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">{workflow.map((item,index) => <WorkflowCard key={item.href} item={item} step={index+1}/>)}</div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Recheck loading and performance whenever route, fuel or conditions change. Export the documents from each tool before assembling your briefing.</p>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 sm:px-6">
        <div><h2 className="font-semibold text-slate-950">Your NavLog account</h2><p className="mt-1 text-sm text-slate-600">Manage your personal saved routes, sign in or create an account.</p></div>
        <Link href="/navlog/account" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-sky-600 hover:text-sky-800">Manage account <span aria-hidden="true">→</span></Link>
      </section>
    </div>
  );
}
