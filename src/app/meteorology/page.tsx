"use client";

import { useEffect, useState } from "react";
import { METEOROLOGY_AERODROMES } from "@/lib/meteorology/airports";

type Section = "charts"|"spc"|"reports"|"area";
type Report = {state:"available"|"unavailable"|"error"|"not-issued"; text:string; detail?:string};
type Response = {icao:string;checkedAt:string;metar:Report;taf:Report};

const SECTIONS: {key:Section;title:string;subtitle:string}[] = [
  {key:"charts", title:"SIGWX & Wind / Temp",subtitle:"AEMET · Iberia"},
  {key:"spc", title:"SPC",subtitle:"IPMA / Met Office"},
  {key:"reports",title:"METAR / TAF",subtitle:"AIP-verified aerodromes"},
  {key:"area",title:"GAMET / SIGMET",subtitle:"LPPC · Portugal"}
];

function Information({title,description,children}:{
  title:string; description:string; children?:React.ReactNode
}) {
  return <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-semibold tracking-tight text-zinc-950">{title}</h2>
    <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
    {children}
  </section>;
}
function ProductDisplay({title,subtitle}: {title:string;subtitle:string}) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
      <h3 className="font-semibold">{title}</h3>
      <span className="text-xs font-medium text-amber-700">Aguarda integração da fonte oficial</span>
    </div>
    <div className="flex min-h-72 items-center justify-center px-6 py-12 text-center">
      <p className="max-w-md text-sm leading-6 text-zinc-500">{subtitle}</p>
    </div>
  </div>;
}
function ReportPanel({title,report,loading}: {title:"METAR"|"TAF";report?:Report;loading:boolean}) {
  return <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
      <h3 className="font-semibold">{title}</h3>
      <span className="text-xs text-zinc-500">{loading?"A consultar":report?.state==="available"?"Mensagem encontrada":report?.state==="not-issued"?"Não emitido":report?.state==="error"?"Erro de consulta":"Não disponível"}</span>
    </div>
    <div className="min-h-36 p-4">
      {loading?<p className="text-sm text-zinc-500">A consultar os dados aeronáuticos…</p>:
      report?.state==="available"?
        <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-zinc-900">{report.text}</pre>:
        <p className="text-sm leading-6 text-zinc-500">{report?.detail??"A aguardar seleção."}</p>}
      {report?.state==="available"&&<p className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">{report.detail}</p>}
    </div>
  </div>;
}
type ChartEntry = {name:string;path:string;validAt:string;runAt?:string;fl?:string};
type ChartResult = {sigwx:ChartEntry[];wind:ChartEntry[];error?:string};
function ChartExplorer() {
  const [charts,setCharts]=useState<ChartResult|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [fl,setFl]=useState("020");
  const [selectedSig,setSelectedSig]=useState("");
  const [selectedWind,setSelectedWind]=useState("");
  useEffect(()=>{
    let active=true;
    fetch("/api/meteorology/charts",{cache:"no-store"})
      .then(async r=>{const data=await r.json() as ChartResult;if(!r.ok)throw Error(data.error||"Fonte indisponível");return data;})
      .then(data=>{if(active){setCharts(data);setLoading(false);}})
      .catch(e=>{if(active){setError(e instanceof Error?e.message:"Erro de consulta");setLoading(false);}});
    return ()=>{active=false;};
  },[]);
  const sigwx=charts?.sigwx||[];
  const wind=(charts?.wind||[]).filter(x=>x.fl===fl);
  const sig=sigwx.find(x=>x.path===selectedSig)||sigwx[sigwx.length-1];
  const win=wind.find(x=>x.path===selectedWind)||wind[0];
  const format=(x:string)=>new Date(x).toLocaleString("pt-PT",{timeZone:"UTC",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" UTC";
  const panel=(name:string,item:ChartEntry|undefined)=>(
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 font-semibold">{name}</div>
      {item?<div className="space-y-3 p-3">
        <p className="text-sm font-medium">Validade: {format(item.validAt)}{item.fl?" · FL"+item.fl:""}</p>
        {/* Images are streamed by the server; no private Supabase key reaches the browser. */}
        <img src={"/api/meteorology/charts?image="+encodeURIComponent(item.path)} alt={name+" AEMET válido "+format(item.validAt)} className="h-auto w-full" />
        <p className="text-xs text-zinc-500">Fonte: © AEMET · Carta original. Confirma a validade impressa na carta.</p>
      </div>:<div className="p-8 text-center text-sm text-zinc-500">Sem carta disponível para esta seleção.</div>}
    </div>
  );
  if(loading)return <p className="text-sm text-zinc-600">A consultar as cartas guardadas…</p>;
  if(error)return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p>;
  return <div className="grid gap-4 lg:grid-cols-2">
    <div className="space-y-3">
      <label className="block text-sm font-semibold">SIGWX · validade UTC
        <select className="mt-1 w-full rounded-xl border border-zinc-300 p-2" value={sig?.path||""} onChange={e=>setSelectedSig(e.target.value)}>
          {sigwx.map(x=><option key={x.path} value={x.path}>{format(x.validAt)}</option>)}
        </select>
      </label>
      {panel("SIGWX Low-Level · SFC–FL150",sig)}
    </div>
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm font-semibold">Nível de voo
          <select className="mt-1 w-full rounded-xl border border-zinc-300 p-2" value={fl} onChange={e=>{setFl(e.target.value);setSelectedWind("");}}>
            {["020","050","100","150"].map(level=><option key={level} value={level}>FL{level}</option>)}
          </select>
        </label>
        <label className="block text-sm font-semibold">Validade UTC
          <select className="mt-1 w-full rounded-xl border border-zinc-300 p-2" value={win?.path||""} onChange={e=>setSelectedWind(e.target.value)}>
            {wind.map(x=><option key={x.path} value={x.path}>{format(x.validAt)}</option>)}
          </select>
        </label>
      </div>
      {panel("Wind & Temperature · HARM",win)}
    </div>
  </div>;
}

export default function MeteorologyPage() {
 const [section,setSection]=useState<Section>("reports");
 const [icao,setIcao]=useState("LPPT");
 const [requestId,setRequestId]=useState(0);
 const [data,setData]=useState<Response|null>(null);
 const [loading,setLoading]=useState(false);
 const selected = METEOROLOGY_AERODROMES.find(x=>x.icao===icao);
 useEffect(()=>{
   if(section!=="reports")return;
   const controller=new AbortController();
   const run=async()=>{
     setLoading(true);setData(null);
     try{
       const response=await fetch("/api/meteorology/observations?icao="+encodeURIComponent(icao),{cache:"no-store",signal:controller.signal});
       if(!response.ok)throw Error("Não foi possível consultar a informação.");
       const result=await response.json() as Response;
       if(!controller.signal.aborted)setData(result);
     }catch{
       if(!controller.signal.aborted)setData({icao,checkedAt:new Date().toISOString(),
         metar:{state:"error",text:"",detail:"Consulta indisponível."},
         taf:{state:"error",text:"",detail:"Consulta indisponível."}});
     }finally{if(!controller.signal.aborted)setLoading(false);}
   };
   void run();
   return ()=>controller.abort();
 },[section,icao,requestId]);
 return <div className="space-y-6">
   <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm md:p-9">
     <div className="flex flex-wrap items-center gap-2">
       <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Briefings · Flight preparation</span>
       <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">PREVIEW</span>
     </div>
     <h1 className="mt-4 text-4xl font-semibold tracking-tight">Meteorology</h1>
     <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
       Documentação aeronáutica para Portugal e Península Ibérica, reunida dentro da Briefings.
       Apenas documentos reais e com indicação da fonte e validade. Integração por fases.
     </p>
   </header>
   <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="Meteorology sections">
     {SECTIONS.map(item=><button key={item.key} type="button" role="tab"
       aria-selected={section===item.key} onClick={()=>setSection(item.key)}
       className={section===item.key
         ?"rounded-2xl border border-zinc-900 bg-zinc-950 px-4 py-3 text-left text-white"
         :"rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-zinc-900 hover:border-zinc-400"}>
       <span className="block text-sm font-semibold">{item.title}</span>
       <span className={"mt-1 block text-xs "+(section===item.key?"text-zinc-300":"text-zinc-500")}>{item.subtitle}</span>
     </button>)}
   </div>
   {section==="charts"&&<div className="space-y-4">
     <Information title="Cartas aeronáuticas da AEMET"
       description="Cartas originais guardadas temporariamente na Supabase, com indicação da validade UTC e do nível de voo. Fonte: © AEMET." />
     <ChartExplorer />
   </div>}
   {section==="spc"&&<Information title="Surface Pressure Charts"
      description="As cartas de superfície do IPMA / Met Office serão mostradas aqui com validade UTC e ciclos. As condições de acesso e republicação estão em verificação.">
      <div className="mt-5"><ProductDisplay title="SPC · Europe / North Atlantic" subtitle="Falta uma fonte que permita a apresentação direta das cartas dentro da Briefings. Não usaremos scraping proibido pelo Met Office."/></div>
   </Information>}
   {section==="area"&&<div className="grid gap-4 lg:grid-cols-2">
     <ProductDisplay title="GAMET · LISBOA FIR / MAINLAND" subtitle="Produto emitido pelo IPMA para a área continental definida no AIP, com ciclos e validade próprios. Integração direta no novo Selfbriefing por validar."/>
     <ProductDisplay title="SIGMET · LPPC FIR" subtitle="Mensagens SIGMET oficiais do IPMA. Só aparecerão aqui quando forem obtidas da fonte e com validade confirmada."/>
   </div>}
   {section==="reports"&&<div className="space-y-4">
     <Information title="METAR / TAF" description="Apenas aeródromos existentes no módulo Performance com serviço METAR e/ou TAF confirmado nos AIP Portugal e Espanha. LPSO e aeródromos sem serviço não aparecem.">
       <div className="mt-5 flex flex-wrap items-end gap-3">
         <label className="block">
           <span className="mb-1 block text-xs font-semibold text-zinc-600">Aeródromo</span>
           <select value={icao} onChange={e=>setIcao(e.target.value)}
             className="min-w-60 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm">
             {METEOROLOGY_AERODROMES.map(ap=><option key={ap.icao} value={ap.icao}>{ap.icao} · {ap.name}</option>)}
           </select>
         </label>
         <button type="button" onClick={()=>setRequestId(n=>n+1)}
           className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-100">
           Atualizar
         </button>
       </div>
       <p className="mt-3 text-xs text-zinc-500">
         {METEOROLOGY_AERODROMES.length} aeródromos verificados · METAR{selected?.taf?" e TAF":" (sem TAF publicado)"} ·
         {data?" Consulta: "+new Date(data.checkedAt).toLocaleString("pt-PT",{timeZone:"UTC"})+" UTC":" A aguardar consulta"}
       </p>
     </Information>
     <div className="grid gap-4 lg:grid-cols-2">
       <ReportPanel title="METAR" report={data?.metar} loading={loading}/>
       {selected?.taf&&<ReportPanel title="TAF" report={data?.taf} loading={loading}/>}
     </div>
     <p className="text-xs leading-6 text-zinc-500">A disponibilidade do serviço está documentada no AIP; a presença de uma mensagem atual depende da fonte. Consulta piloto via MET Norway Tafmetar, sujeita a disponibilidade do fornecedor.</p>
   </div>}
   <p className="border-t border-zinc-200 pt-4 text-xs text-zinc-500">Pré-visualização técnica. Confirmar mensagens, emissão e validade nas fontes oficiais antes da utilização operacional.</p>
 </div>;
}
