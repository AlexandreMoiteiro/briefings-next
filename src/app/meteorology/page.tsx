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
    <div className="mb-3 flex min-h-11 flex-wrap items-center justify-center gap-2 border-y border-zinc-100 py-1.5">
      <button type="button" disabled={!previous} onClick={() => previous && onSelect(previous.path)}
        aria-label={`Previous ${label} validity time`} title="Previous time"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-25">
        ←
      </button>
      <label className="relative inline-flex items-center">
        <span className="sr-only">{label} validity time (UTC)</span>
        <select value={selected?.path ?? ""} onChange={(event) => onSelect(event.target.value)} disabled={!selected}
          className="w-48 cursor-pointer appearance-none rounded-md bg-transparent py-2 pl-3 pr-6 text-center text-sm font-semibold tabular-nums text-zinc-900 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-50 sm:w-52">
          {!selected && <option value="">Unavailable</option>}
          {items.map((chart) => <option key={chart.path} value={chart.path}>{fmt(chart.validAt)}</option>)}
        </select>
        <span aria-hidden="true" className="pointer-events-none absolute right-2 text-xs text-zinc-400">⌄</span>
      </label>
      <button type="button" disabled={!next} onClick={() => next && onSelect(next.path)}
        aria-label={`Next ${label} validity time`} title="Next time"
        className="flex h-9 w-9 items-center justify-center rounded-md text-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-25">
        →
      </button>
      {!isCurrent && current && <button type="button" onClick={() => onSelect("")}
        className="text-xs text-zinc-500 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900">
        Current
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
    return <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-zinc-950">{kind==="sigwx"?"SIGWX Low-Level":"Wind & Temperature"}</h2>
        <div className="flex items-center gap-3">
          {kind === "wind" && <label className="inline-flex items-center gap-1.5">
            <span className="sr-only">Wind and temperature flight level</span>
            <select value={fl} onChange={(event)=>{setFl(event.target.value);setWindPath("");}}
              className="cursor-pointer rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-800 focus-visible:outline-2 focus-visible:outline-zinc-900">
              {["020","050","100","150"].map((level) => <option key={level} value={level}>FL{level}</option>)}
            </select>
          </label>}
          <button type="button" disabled={!c} onClick={()=>setFull(kind)}
            className="text-xs text-zinc-500 hover:text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-zinc-900 disabled:opacity-40">
            Full screen
          </button>
        </div>
      </div>
      <ChartTimePicker items={items} selected={c} current={current} onSelect={onSelect} label={kind === "sigwx" ? "SIGWX" : "wind and temperature"}/>
      {c?<button type="button" onClick={()=>setFull(kind)} aria-label={`Expand ${chartName(c)} to full screen`} className="block w-full cursor-zoom-in"><ChartImage chart={c}/></button>:
        <p className="p-8 text-center text-sm text-zinc-500">No chart available.</p>}
      <p className="mt-2 text-right text-[11px] text-zinc-400">© AEMET</p>
    </section>;
  };
  const fullCharts=full==="both"?ordered:full==="sigwx"?(sig?[sig]:[]):(wind?[wind]:[]);
  return <div className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-950 sm:text-3xl">AEMET Weather Charts</h1>
        <p className="mt-1 text-sm text-zinc-500">SIGWX and wind/temperature · Times in UTC</p>
      </div>
      <button type="button" onClick={refresh} disabled={refreshing}
        title={lastChecked?"Last checked: "+fmt(lastChecked):"Automatic refresh every 5 minutes"}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50">
        {refreshing?"Refreshing…":"Refresh"}
      </button>
    </header>
    {error&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}{data?" Showing the most recently loaded list.":""}</p>}
    {loading?<p className="text-sm">Loading charts…</p>:!data?<p className="rounded-xl bg-white p-5 text-sm text-zinc-600">Charts could not be loaded. Please try Refresh charts.</p>:
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200">
        <div className="flex items-center gap-5" role="group" aria-label="Chart view">
          <button type="button" aria-pressed={!compare} onClick={()=>setCompare(false)}
            className={"border-b-2 pb-2 text-sm transition " + (!compare?"border-zinc-900 font-semibold text-zinc-950":"border-transparent text-zinc-500 hover:text-zinc-900")}>SIGWX + Wind / Temp</button>
          <button type="button" aria-pressed={compare} onClick={()=>setCompare(true)}
            className={"border-b-2 pb-2 text-sm transition " + (compare?"border-zinc-900 font-semibold text-zinc-950":"border-transparent text-zinc-500 hover:text-zinc-900")}>Compare SIGWX</button>
        </div>
        {compare&&<button type="button" onClick={()=>setFull("both")} disabled={ordered.length<2} className="pb-2 text-xs text-zinc-600 hover:underline disabled:opacity-40">Full screen</button>}
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
    <p className="text-xs text-zinc-500">Charts © AEMET. Check validity times and consult official aviation weather information before flight.</p>
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
