"use client";

import { useEffect, useState } from "react";
import { PERFORMANCE_AERODROMES } from "@/lib/performance/aerodromes";

type Tab = "charts" | "spc" | "airports" | "lppc";
type Report = { status: "available" | "missing" | "error"; raw: string; note?: string };
type WeatherResponse = {
  icao: string;
  source: string;
  checkedAt: string;
  metar: Report;
  taf: Report;
};

const TABS: {id: Tab; label: string; sub: string}[] = [
  {id:"charts", label:"SIGWX & Wind / Temp", sub:"AEMET"},
  {id:"spc", label:"SPC", sub:"Met Office / IPMA"},
  {id:"airports", label:"METAR / TAF", sub:"Performance aerodromes"},
  {id:"lppc", label:"GAMET / SIGMET", sub:"LPPC FIR"}
];
const AIRPORTS = Object.entries(PERFORMANCE_AERODROMES)
  .map(([icao, airport]) => ({icao, name:airport.name}))
  .sort((a,b) => a.icao.localeCompare(b.icao));

function External({href, children, primary=false}: {href:string; children:React.ReactNode; primary?:boolean}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className={primary
        ? "inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-800"
        : "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}
function Product({eyebrow, title, description, children}: {
  eyebrow:string; title:string; description:string; children:React.ReactNode
}) {
  return (
    <article className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
      <p className="text-xs font-bold uppercase tracking-[.15em] text-sky-700">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-zinc-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
      <div className="mt-5">{children}</div>
    </article>
  );
}
function ReportPanel({name,report,loading}: {name:"METAR"|"TAF";report?:Report;loading:boolean}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <h3 className="font-semibold text-zinc-900">{name}</h3>
        <span className="text-xs font-medium text-zinc-500">
          {loading ? "A consultar" : !report ? "Sem consulta" :
           report.status === "available" ? "Mensagem encontrada" :
           report.status === "missing" ? "Sem mensagem disponível" : "Fonte indisponível"}
        </span>
      </div>
      <div className="min-h-36 p-4">
        {loading ? <p className="text-sm text-zinc-500">A obter dados da fonte meteorológica…</p> :
         report?.status === "available" ?
         <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-7 text-zinc-900">{report.raw}</pre> :
         <p className="text-sm leading-6 text-zinc-600">
           {report?.note || "Seleciona um aeródromo para consultar as mensagens."}
         </p>}
      </div>
    </section>
  );
}
export default function MeteorologyPage() {
  const [tab,setTab] = useState<Tab>("charts");
  const [icao,setIcao] = useState("LPPT");
  const [revision,setRevision] = useState(0);
  const [weather,setWeather] = useState<WeatherResponse|null>(null);
  const [loading,setLoading] = useState(false);

  useEffect(() => {
    if (tab !== "airports") return;
    const abort = new AbortController();
    const load = async () => {
      setLoading(true);
      setWeather(null);
      try {
        const response = await fetch("/api/meteorology/observations?icao=" + encodeURIComponent(icao),{
          signal:abort.signal, cache:"no-store"
        });
        if (!response.ok) throw new Error("Não foi possível consultar as mensagens.");
        const data = await response.json() as WeatherResponse;
        if (!abort.signal.aborted) setWeather(data);
      } catch(error) {
        if (!abort.signal.aborted) {
          const note = error instanceof Error ? error.message : "Serviço temporariamente indisponível.";
          setWeather({
            icao,source:"MET Norway",checkedAt:new Date().toISOString(),
            metar:{status:"error",raw:"",note},taf:{status:"error",raw:"",note}
          });
        }
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => abort.abort();
  },[icao,revision,tab]);

  return (
    <div className="space-y-7">
      <header className="rounded-3xl border border-zinc-200 bg-white px-6 py-7 shadow-sm md:px-8 md:py-9">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-zinc-500">Briefings / Meteorology</p>
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900">PREVIEW ONLY</span>
        </div>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">Aviation weather · Iberia</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 md:text-base">
          SIGWX low-level e vento/temperatura da AEMET, cartas SPC, mensagens dos aeródromos
          autorizados no módulo Performance e meteorologia de área LPPC. Sem cartas NOAA.
        </p>
      </header>

      <nav aria-label="Meteorology sections" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {TABS.map(item=>(
          <button key={item.id} type="button" onClick={()=>setTab(item.id)}
            aria-current={tab===item.id?"page":undefined}
            className={tab===item.id
              ? "rounded-2xl border border-sky-700 bg-sky-700 px-4 py-3 text-left text-white shadow-sm"
              : "rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left text-zinc-800 transition hover:border-sky-300"}>
            <span className="block text-sm font-semibold">{item.label}</span>
            <span className={tab===item.id?"mt-1 block text-xs text-sky-100":"mt-1 block text-xs text-zinc-500"}>{item.sub}</span>
          </button>
        ))}
      </nav>

      {tab==="charts" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Product eyebrow="AEMET · Península e Baleares" title="SIGWX Low Level · SFC–FL150"
            description="Carta oficial de tempo significativo de baixa cota da AEMET, com ciclos 00/06/12/18 UTC. É o produto espanhol para a Península, não a carta WAFS de alta altitude.">
            <External primary href="https://ama.aemet.es/">Consultar SIGWX no AMA</External>
          </Product>
          <Product eyebrow="AEMET · Península Ibérica" title="Wind & Temperature"
            description="Cartas AEMET de vento e temperatura em altitude. Os níveis e períodos disponíveis dependem dos produtos publicados no AMA.">
            <External primary href="https://ama.aemet.es/">Consultar Wind / Temp no AMA</External>
          </Product>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          <strong>Integração em validação:</strong> a chave AEMET OpenData não dá, por si só, acesso
          às cartas aeronáuticas do AMA. As imagens não são apresentadas como se estivessem
          integradas: requerem uma interface autorizada ou um endereço público estável confirmado.
          A aplicação não copia cartas históricas como se fossem atuais.
        </div>
      </div>}

      {tab==="spc" && <div className="grid gap-4 lg:grid-cols-2">
        <Product eyebrow="Met Office · Europa e Atlântico" title="Surface Pressure Charts (SPC)"
          description="Análise e cartas de previsão à superfície, com isóbaras, centros de pressão e frentes. A página oficial disponibiliza previsões até cinco dias, com horas de validade próprias.">
          <External primary href="https://weather.metoffice.gov.uk/maps-and-charts/surface-pressure">Abrir SPC do Met Office</External>
        </Product>
        <Product eyebrow="IPMA · Portugal" title="Cartas de superfície / Selfbriefing"
          description="Alternativa portuguesa para os produtos meteorológicos aeronáuticos de superfície. O acesso e a redistribuição dependem das condições do serviço Selfbriefing.">
          <External href="https://www.ipma.pt/pt/produtoseservicos/index.jsp?page=selfbriefing.xml">Abrir IPMA Selfbriefing</External>
        </Product>
      </div>}

      {tab==="airports" && <div className="space-y-4">
        <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.15em] text-sky-700">Live reports</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-900">METAR / TAF</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
                A lista é importada diretamente dos aeródromos admitidos em Performance.
                Uma mensagem ausente não é substituída por uma previsão numérica.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-zinc-500">Aeródromo</span>
                <select className="min-w-56 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm"
                  value={icao} onChange={event=>setIcao(event.target.value)}>
                  {AIRPORTS.map(ap=><option key={ap.icao} value={ap.icao}>{ap.icao} · {ap.name}</option>)}
                </select>
              </label>
              <button type="button" onClick={()=>setRevision(n=>n+1)}
                className="rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-100">
                Atualizar
              </button>
            </div>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Fonte: MET Norway Tafmetar (OPMET recebido de várias origens).
            {weather?.checkedAt ? " · Consulta: "+new Date(weather.checkedAt).toLocaleString("pt-PT",{timeZone:"UTC"})+" UTC" : ""}
            {" · "}{AIRPORTS.length} aeródromos no módulo Performance.
          </p>
        </section>
        <div className="grid gap-4 lg:grid-cols-2">
          <ReportPanel name="METAR" report={weather?.metar} loading={loading}/>
          <ReportPanel name="TAF" report={weather?.taf} loading={loading}/>
        </div>
        <p className="text-sm leading-6 text-zinc-600">
          Nem todos os aeródromos em Performance possuem METAR e/ou TAF (por exemplo, LPSO).
          A ausência de mensagem significa apenas que a fonte não devolveu um relatório atual;
          não confirma por si só se o serviço existe no aeródromo.
        </p>
      </div>}

      {tab==="lppc" && <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Product eyebrow="Portugal · LPPC FIR" title="SIGMET"
            description="Mensagens de fenómenos meteorológicos significativos publicadas pelo serviço meteorológico aeronáutico responsável. Consultar validade e região afetada antes do voo.">
            <External primary href="https://www.ipma.pt/pt/produtoseservicos/index.jsp?page=selfbriefing.xml">Consultar SIGMET · IPMA</External>
          </Product>
          <Product eyebrow="Portugal · voo a baixa altura" title="GAMET / Area forecast"
            description="A disponibilidade de GAMET para a área LPPC e um acesso automatizável ainda têm de ser confirmados com o IPMA. Não se apresentam mensagens fictícias.">
            <External href="https://www.ipma.pt/pt/produtoseservicos/index.jsp?page=selfbriefing.xml">Ver produtos disponíveis · IPMA</External>
          </Product>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">
          O Selfbriefing exige condições de acesso próprias. Os avisos operacionais devem ser
          confirmados na fonte oficial e com a respetiva validade; a ausência nesta página
          não significa ausência de SIGMET em vigor.
        </div>
      </div>}
      <footer className="border-t border-zinc-200 pt-4 text-xs leading-6 text-zinc-500">
        Preview experimental. Não substitui um briefing meteorológico operacional validado.
        Não é efetuado qualquer deployment de produção.
      </footer>
    </div>
  );
}
