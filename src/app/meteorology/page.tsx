"use client";
/* eslint-disable @next/next/no-img-element -- Keep official chart PNGs unmodified for full-resolution viewing. */
import { useEffect, useState } from "react";

type Chart={name:string;path:string;validAt:string;runAt?:string;fl?:string};
type Data={sigwx:Chart[];wind:Chart[];error?:string};
type FullMode="sigwx"|"wind"|"both"|null;
const imageUrl=(c:Chart)=>"/api/meteorology/charts?image="+encodeURIComponent(c.path);
const fmt=(v:string)=>new Date(v).toLocaleString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false})+" UTC";
const chartName=(c:Chart)=>c.path.startsWith("sigwx/")?"SIGWX Low-Level":"Wind & Temperature · FL"+c.fl;
function currentChart(items:Chart[],now:number,interval:number):Chart|undefined {
  if(!items.length)return undefined;
  const slot=Math.floor(now/(interval*3600000))*(interval*3600000);
  const past=items.filter(c=>Date.parse(c.validAt)<=slot);
  if(past.length)return past.reduce((a,b)=>Date.parse(a.validAt)>=Date.parse(b.validAt)?a:b);
  return items.reduce((a,b)=>Math.abs(Date.parse(a.validAt)-now)<=Math.abs(Date.parse(b.validAt)-now)?a:b);
}
function ChartImage({chart}:{chart:Chart}) {
  return <img src={imageUrl(chart)} alt={chartName(chart)+" · "+fmt(chart.validAt)} className="block h-auto w-full object-contain"/>;
}

function ChartTimePicker({
  items, selected, current, onSelect, label,
}: {
  items: Chart[];
  selected: Chart | undefined;
  current: Chart | undefined;
  onSelect: (path: string) => void;
  label: string;
}) {
  const index = selected ? items.findIndex((chart) => chart.path === selected.path) : -1;
  const previous = index > 0 ? items[index - 1] : undefined;
  const next = index >= 0 ? items[index + 1] : undefined;
  const isCurrent = selected?.path === current?.path;

  return (
    <div className="relative mb-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 border-l-[3px] border-sky-500 pl-3" aria-live="polite">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Valid at · UTC</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold tabular-nums text-zinc-950">{selected ? fmt(selected.validAt) : "Unavailable"}</p>
            {isCurrent && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">Current period</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1">
            <button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.path)}
              aria-label={`Previous ${label} validity time`} title="Previous time"
              className="flex h-8 w-9 items-center justify-center rounded-lg text-base font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-30">
              ←
            </button>
            <span className="h-5 w-px bg-zinc-200" aria-hidden="true" />
            <button type="button" disabled={!next} onClick={() => next && onSelect(next.path)}
              aria-label={`Next ${label} validity time`} title="Next time"
              className="flex h-8 w-9 items-center justify-center rounded-lg text-base font-semibold text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-30">
              →
            </button>
          </div>
          <details key={selected?.path ?? "empty"} className="group relative">
            <summary className="flex h-10 cursor-pointer list-none select-none items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden">
              All times
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-zinc-500 transition group-open:rotate-180">
                <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
              </svg>
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10">
              <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Available times · UTC</p>
              <div className="max-h-60 space-y-0.5 overflow-y-auto">
                {items.map((chart) => (
                  <button key={chart.path} type="button"
                    onClick={(event) => { onSelect(chart.path); event.currentTarget.closest("details")?.removeAttribute("open"); }}
                    aria-pressed={selected?.path === chart.path}
                    className={"flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs tabular-nums transition " + (selected?.path === chart.path ? "bg-zinc-900 font-semibold text-white" : "text-zinc-700 hover:bg-zinc-100")}>
                    <span>{fmt(chart.validAt)}</span>
                    {chart.path === current?.path && <span className={"text-[10px] font-semibold " + (selected?.path === chart.path ? "text-emerald-200" : "text-emerald-700")}>Current</span>}
                  </button>
                ))}
              </div>
            </div>
          </details>
        </div>
      </div>
      {!isCurrent && current && <button type="button" onClick={() => onSelect("")}
        className="mt-2 text-xs font-semibold text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
        ↺ Back to current period
      </button>}
    </div>
  );
}
export default function MeteorologyPage(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const [fl,setFl]=useState("020"),[sigPath,setSigPath]=useState(""),[windPath,setWindPath]=useState("");
  const [compare,setCompare]=useState(false);
  const [full,setFull]=useState<FullMode>(null);
  const [now,setNow]=useState(()=>Date.now());
  const [refreshKey,setRefreshKey]=useState(0);
  const [refreshing,setRefreshing]=useState(false);
  const [lastChecked,setLastChecked]=useState<string|null>(null);
  const refresh=()=>{
    setNow(Date.now());
    setRefreshing(true);
    setRefreshKey(value=>value+1);
  };
  useEffect(()=>{
    let active=true;
    fetch("/api/meteorology/charts",{cache:"no-store"})
      .then(async r=>{const x=await r.json() as Data;if(!r.ok)throw new Error(x.error||"Weather charts unavailable.");return x;})
      .then(x=>{if(active){setData(x);setError("");setLastChecked(new Date().toISOString());}})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Weather charts unavailable.");})
      .finally(()=>{if(active){setLoading(false);setRefreshing(false);}});
    return()=>{active=false;};
  },[refreshKey]);
  useEffect(()=>{
    const update=()=>{
      setNow(Date.now());
      setRefreshing(true);
      setRefreshKey(value=>value+1);
    };
    const timer=window.setInterval(update,5*60*1000);
    const onVisible=()=>{if(document.visibilityState==="visible")update();};
    document.addEventListener("visibilitychange",onVisible);
    return()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible);};
  },[]);
  useEffect(()=>{
    if(!full)return;
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setFull(null);};
    window.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",escape);};
  },[full]);
  const sigwx=(data?.sigwx||[]).slice().sort((a,b)=>a.validAt.localeCompare(b.validAt));
  const winds=(data?.wind||[]).filter(c=>c.fl===fl).slice().sort((a,b)=>a.validAt.localeCompare(b.validAt));
  const sig=sigwx.find(c=>c.path===sigPath)||currentChart(sigwx,now,6);
  const wind=winds.find(c=>c.path===windPath)||currentChart(winds,now,3);
  // Compare only the two latest SIGWX images already available.
  const ordered=sigwx.slice(-2);
  const panel=(kind:"sigwx"|"wind",c:Chart|undefined)=>{
    const items = kind === "sigwx" ? sigwx : winds;
    const onSelect = kind === "sigwx" ? setSigPath : setWindPath;
    const current = currentChart(items,now,kind === "sigwx" ? 6 : 3);
    return <section className="min-w-0 rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black " + (kind === "sigwx" ? "bg-sky-100 text-sky-800" : "bg-indigo-100 text-indigo-800")}>
            {kind === "sigwx" ? "S" : "W"}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">AEMET · Aviation weather</p>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold tracking-tight text-zinc-950 sm:text-lg">{kind==="sigwx"?"SIGWX Low-Level":"Wind & Temperature"}</h2>
              {kind === "wind" && <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">FL{fl}</span>}
            </div>
          </div>
        </div>
        <button type="button" disabled={!c} onClick={()=>setFull(kind)}
          className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-40">
          ⤢ <span className="hidden sm:inline">Expand</span>
        </button>
      </div>
      <ChartTimePicker items={items} selected={c} current={current} onSelect={onSelect} label={kind === "sigwx" ? "SIGWX" : "wind and temperature"}/>
      {c?<button type="button" onClick={()=>setFull(kind)} aria-label={`Expand ${chartName(c)} to full screen`} className="block w-full cursor-zoom-in overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50 p-2 transition hover:border-zinc-300"><ChartImage chart={c}/></button>:
        <p className="rounded-2xl bg-zinc-50 p-8 text-center text-sm text-zinc-500">No chart available.</p>}
      <p className="mt-3 text-right text-[11px] font-medium text-zinc-400">Official chart · © AEMET</p>
    </section>;
  };
  const fullCharts=full==="both"?ordered:full==="sigwx"?(sig?[sig]:[]):(wind?[wind]:[]);
  return <div className="space-y-5">
    <header className="rounded-3xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">Aviation weather</p>
          <h1 className="mt-1 text-3xl font-semibold">AEMET Weather Charts</h1>
          <p className="mt-2 text-sm text-zinc-600">SIGWX and wind/temperature charts. All validity times are shown in UTC.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50">
            {refreshing?"Refreshing…":"Refresh charts"}
          </button>
          <p className="text-xs text-zinc-500" aria-live="polite">{lastChecked?"List checked: "+fmt(lastChecked):"Automatic refresh every 5 minutes"}</p>
        </div>
      </div>
    </header>
    <p className="text-xs text-zinc-500">Charts © AEMET. Check the chart&apos;s validity and consult official aviation weather information before flight.</p>
    {error&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}{data?" Showing the most recently loaded list.":""}</p>}
    {loading?<p className="text-sm">Loading charts…</p>:!data?<p className="rounded-xl bg-white p-5 text-sm text-zinc-600">Charts could not be loaded. Please try Refresh charts.</p>:
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">View</span>
          <div className="inline-flex max-w-full rounded-xl bg-zinc-100 p-1" role="group" aria-label="Chart view">
            <button type="button" aria-pressed={!compare} onClick={()=>setCompare(false)} className={"rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm "+(!compare?"bg-white text-zinc-950 shadow-sm":"text-zinc-600 hover:text-zinc-950")}>SIGWX + Wind / Temp</button>
            <button type="button" aria-pressed={compare} onClick={()=>setCompare(true)} className={"rounded-lg px-3 py-2 text-xs font-semibold transition sm:text-sm "+(compare?"bg-white text-zinc-950 shadow-sm":"text-zinc-600 hover:text-zinc-950")}>Compare SIGWX</button>
          </div>
        </div>
        {!compare ? <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-zinc-400">Wind level</span>
          <div className="inline-flex rounded-xl bg-zinc-100 p-1" role="group" aria-label="Wind and temperature flight level">
            {["020","050","100","150"].map((level) => (
              <button key={level} type="button" aria-pressed={fl === level} onClick={()=>{setFl(level);setWindPath("");}}
                className={"rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-3 " + (fl === level ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-600 hover:bg-white hover:text-zinc-950")}>
                FL{level}
              </button>
            ))}
          </div>
        </div> : <button type="button" onClick={()=>setFull("both")} disabled={ordered.length<2} className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">⤢ Compare full screen</button>}
      </div>
      {!compare?<div className="grid gap-4 lg:grid-cols-2">{panel("sigwx",sig)}{panel("wind",wind)}</div>:
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">The two latest available SIGWX charts · earlier validity on the left, later validity on the right · automatically refreshed.</p>
        <div className="grid gap-3 sm:grid-cols-2">{ordered.map(c=><section key={c.path} className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold">{chartName(c)} · {fmt(c.validAt)}</div>
          <button type="button" onClick={()=>setFull("both")} className="w-full cursor-zoom-in"><ChartImage chart={c}/></button>
        </section>)}</div>
      </div>}
    </div>}
    {full&&fullCharts.length>0&&<div role="dialog" aria-modal="true" aria-label="Full-screen PNG viewer" className="fixed inset-0 z-[100] bg-black">
      <button type="button" onClick={()=>setFull(null)} className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-black shadow">Close ×</button>
      <div className={"grid h-full w-full min-h-0 items-center gap-1 "+(full==="both"?"grid-cols-2":"grid-cols-1")}>
        {fullCharts.map(c=><div key={c.path} className="flex h-full min-h-0 min-w-0 items-center justify-center overflow-auto">
          <img src={imageUrl(c)} alt={chartName(c)+" "+fmt(c.validAt)} className="max-h-screen max-w-full object-contain"/>
        </div>)}
      </div>
    </div>}

  </div>;
}
