import { NextRequest, NextResponse } from "next/server";
import { airportWeatherService } from "@/lib/meteorology/airports";

export const runtime = "nodejs";

type Result = { state: "available"|"unavailable"|"error"|"not-issued"; text: string; detail?:string };
const NO_REPORT:Result = {
  state:"unavailable",text:"",
  detail:"A fonte não devolveu uma mensagem. Isto não significa que não exista serviço meteorológico neste aeródromo."
};

async function fetchReport(icao:string, kind:"metar"|"taf"):Promise<Result> {
  const url = "https://api.met.no/weatherapi/tafmetar/1.0/" + kind + ".txt?icao=" + encodeURIComponent(icao);
  try {
    const res = await fetch(url,{
      headers:{
        "User-Agent":"Briefings-Next/1.0 (https://github.com/AlexandreMoiteiro/briefings-next)",
        "Accept":"text/plain"
      },
      next:{revalidate:600},
      signal:AbortSignal.timeout(10000)
    });
    if(res.status===204 || res.status===404)return NO_REPORT;
    if(!res.ok) return {state:"error",text:"",detail:"Serviço meteorológico temporariamente indisponível (HTTP " + res.status + ")."};
    const text = (await res.text()).trim();
    const matched = new RegExp("\\b"+icao+"\\b").test(text);
    if(!matched || !text) return NO_REPORT;
    // MET Norway may return reports from the previous 24 hours. Preserve the
    // original TAC rather than presenting an arbitrary historic message as current.
    return {state:"available",text:text.slice(0,12000),
      detail:"Fonte MET Norway · mensagens recebidas nas últimas 24 horas. Confirma a hora de emissão/validade no texto."};
  }catch{
    return {state:"error",text:"",detail:"Não foi possível contactar a fonte METAR/TAF."};
  }
}

export async function GET(req:NextRequest) {
  const icao = (req.nextUrl.searchParams.get("icao")??"").trim().toUpperCase();
  const service = airportWeatherService(icao);
  if(!service) return NextResponse.json({error:"Aeródromo sem serviço publicado na seleção de Meteorology"},{status:400});
  const [metar,taf] = await Promise.all([
    service.metar ? fetchReport(icao,"metar") : Promise.resolve<Result>({state:"not-issued",text:"",detail:"Sem serviço METAR documentado."}),
    service.taf ? fetchReport(icao,"taf") : Promise.resolve<Result>({state:"not-issued",text:"",detail:"Sem serviço TAF documentado no AIP."})
  ]);
  return NextResponse.json({icao,checkedAt:new Date().toISOString(),metar,taf},
    {headers:{"Cache-Control":"no-store"}});
}
