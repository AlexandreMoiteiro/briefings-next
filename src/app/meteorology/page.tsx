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
  const optionList=(items:Chart[])=>items.map(c=><option key={c.path} value={c.path}>{chartName(c)} · {fmt(c.validAt)}</option>);
  const select=(items:Chart[],selected:Chart|undefined,change:(p:string)=>void,label:string)=><label className="block min-w-0 flex-1 text-xs font-semibold text-zinc-700">{label}
    <select className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-2 text-sm font-normal" value={selected?.path||""} onChange={e=>change(e.target.value)}>{optionList(items)}</select>
  </label>;
  const panel=(kind:"sigwx"|"wind",c:Chart|undefined)=><section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{kind==="sigwx"?"SIGWX Low-Level":"Wind & Temperature"}</h2>
      <button type="button" disabled={!c} onClick={()=>setFull(kind)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-40">Full screen</button>
    </div>
    <div className="mb-3 flex gap-2">
      {kind==="wind"&&<label className="w-28 text-xs font-semibold">Flight level
        <select className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-2 text-sm" value={fl} onChange={e=>{setFl(e.target.value);setWindPath("");}}>
          {["020","050","100","150"].map(x=><option key={x} value={x}>FL{x}</option>)}
        </select></label>}
      {select(kind==="sigwx"?sigwx:winds,c,kind==="sigwx"?setSigPath:setWindPath,"Valid at (UTC)")}
    </div>
    {c?<button type="button" onClick={()=>setFull(kind)} aria-label="Enlarge PNG to full screen" className="block w-full cursor-zoom-in rounded-xl bg-zinc-100 p-2"><ChartImage chart={c}/></button>:
      <p className="p-8 text-center text-sm text-zinc-500">No chart available.</p>}
    {c&&<p className="mt-3 text-xs text-zinc-500">Valid: {fmt(c.validAt)} · © AEMET</p>}
  </section>;
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-zinc-300 p-1">
          <button type="button" aria-pressed={!compare} onClick={()=>setCompare(false)} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(!compare?"bg-zinc-900 text-white":"text-zinc-700")}>SIGWX + Wind / Temp</button>
          <button type="button" aria-pressed={compare} onClick={()=>setCompare(true)} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(compare?"bg-zinc-900 text-white":"text-zinc-700")}>Compare charts</button>
        </div>
        {compare&&<button type="button" onClick={()=>setFull("both")} disabled={ordered.length<2} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Compare full screen</button>}
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
