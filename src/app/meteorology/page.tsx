"use client";
import { useEffect, useState } from "react";
type Chart={name:string;path:string;validAt:string;runAt?:string;fl?:string};
type Data={sigwx:Chart[];wind:Chart[];error?:string};
const format=(s:string)=>new Date(s).toLocaleString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:false})+" UTC";
const title=(c:Chart)=>c.path.startsWith("sigwx/")?"SIGWX Low-Level":"Wind & Temperature · FL"+c.fl;
function Viewer({chart}:{chart:Chart}){return <div className="flex h-full min-h-0 flex-col gap-2">
  <div className="flex flex-wrap justify-between gap-2 text-sm"><b>{title(chart)}</b><span>Valid: {format(chart.validAt)}</span></div>
  <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-zinc-100 p-2">
    <img src={"/api/meteorology/charts?image="+encodeURIComponent(chart.path)} alt={title(chart)+", valid "+format(chart.validAt)} className="max-h-full max-w-full object-contain"/>
  </div>
  <p className="text-xs text-zinc-500">Source: © AEMET · Original chart · Verify the validity printed on the image.</p>
</div>}
export default function MeteorologyPage(){
  const [data,setData]=useState<Data|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
  const [compare,setCompare]=useState(false),[full,setFull]=useState(false),[intro,setIntro]=useState(false);
  const [left,setLeft]=useState(""),[right,setRight]=useState("");
  useEffect(()=>{let active=true;
    fetch("/api/meteorology/charts",{cache:"no-store"}).then(async response=>{const result=await response.json() as Data;if(!response.ok)throw Error(result.error||"Charts unavailable.");return result;})
    .then(result=>{if(active){setData(result);setLoading(false);}}).catch(e=>{if(active){setError(String(e));setLoading(false);}});
    try{if(localStorage.getItem("briefings-aemet-feature-v1")!=="seen")setIntro(true);}catch{setIntro(true);}
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(!full)return;const prev=document.body.style.overflow;document.body.style.overflow="hidden";
    const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setFull(false);};window.addEventListener("keydown",escape);
    return()=>{document.body.style.overflow=prev;window.removeEventListener("keydown",escape);};},[full]);
  const list=[...(data?.sigwx||[]),...(data?.wind||[])].sort((a,b)=>a.validAt.localeCompare(b.validAt));
  const lpath=list.some(x=>x.path===left)?left:(data?.sigwx?.at(-1)?.path||list.at(-1)?.path||"");
  const rpath=list.some(x=>x.path===right)?right:(list.find(x=>x.path!==lpath)?.path||lpath);
  const a=list.find(x=>x.path===lpath),b=list.find(x=>x.path===rpath);
  const options=list.map(c=><option key={c.path} value={c.path}>{title(c)} · {format(c.validAt)}</option>);
  const controls=(expanded:boolean)=><div className={expanded?"flex h-full min-h-0 flex-col gap-3":"space-y-4"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex rounded-xl border border-zinc-300 p-1">
        <button type="button" onClick={()=>setCompare(false)} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(!compare?"bg-zinc-900 text-white":"text-zinc-700")}>Single chart</button>
        <button type="button" onClick={()=>setCompare(true)} className={"rounded-lg px-4 py-2 text-sm font-semibold "+(compare?"bg-zinc-900 text-white":"text-zinc-700")}>Compare two charts</button>
      </div>
      <button type="button" onClick={()=>setFull(!expanded)} className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold">{expanded?"Exit full screen":"Full screen"}</button>
    </div>
    <div className={"grid gap-3 "+(compare?"grid-cols-2":"grid-cols-1")}>
      <label className="text-sm font-semibold">{compare?"Left chart":"Chart"}
        <select className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-2 text-sm font-normal" value={lpath} onChange={e=>setLeft(e.target.value)}>{options}</select>
      </label>
      {compare&&<label className="text-sm font-semibold">Right chart
        <select className="mt-1 w-full rounded-xl border border-zinc-300 bg-white p-2 text-sm font-normal" value={rpath} onChange={e=>setRight(e.target.value)}>{options}</select>
      </label>}
    </div>
    <div className={(expanded?"min-h-0 flex-1 ":"")+"grid gap-4 "+(compare?"grid-cols-2":"grid-cols-1")}>
      {a&&<div className={(expanded?"min-h-0 ":"min-h-80 ")+"rounded-2xl border border-zinc-200 bg-white p-3"}><Viewer chart={a}/></div>}
      {compare&&b&&<div className={(expanded?"min-h-0 ":"min-h-80 ")+"rounded-2xl border border-zinc-200 bg-white p-3"}><Viewer chart={b}/></div>}
    </div>
    <p className="text-xs text-zinc-500">© AEMET · Charts support flight preparation and do not replace official aeronautical briefing.</p>
  </div>;
  const dismiss=()=>{setIntro(false);try{localStorage.setItem("briefings-aemet-feature-v1","seen");}catch{}};
  return <div className="space-y-6">
    <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-9">
      <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Briefings · Flight preparation</span><span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">PREVIEW</span></div>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">AEMET Weather Charts</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">SIGWX Low-Level and Wind & Temperature charts for the Iberian Peninsula. View a single forecast or compare any two charts, including in full screen.</p>
    </header>
    {loading?<p>Loading charts…</p>:error?<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>:list.length===0?<p>No charts available at present.</p>:controls(false)}
    {full&&a&&<div className="fixed inset-0 z-[100] flex flex-col bg-zinc-50 p-3 md:p-5" role="dialog" aria-modal="true" aria-label="Full-screen AEMET charts">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">AEMET Weather Charts</h2><button type="button" onClick={()=>setFull(false)} className="rounded-xl bg-zinc-900 px-4 py-2 font-semibold text-white">Close ×</button></div>
      <div className="min-h-0 flex-1">{controls(true)}</div>
    </div>}
    {intro&&<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="New feature announcement">
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase text-blue-800">New feature</span>
        <h2 className="mt-4 text-2xl font-bold">AEMET charts are now available in Briefings</h2>
        <p className="mt-3 text-sm leading-7 text-zinc-700">Following requests from our users, we have made AEMET SIGWX and Wind & Temperature charts available directly in Briefings. Since the AEMET website is currently not reliably accessible to everyone, this provides another way to view these charts.</p>
        <p className="mt-3 text-sm leading-7 text-zinc-700">You can view a chart full screen or compare two side by side. All charts remain © AEMET, and the original validity information is preserved.</p>
        <button type="button" onClick={dismiss} className="mt-6 w-full rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white">Explore weather charts</button>
      </div>
    </div>}
  </div>;
}
