import { NextRequest, NextResponse } from "next/server";
import { PERFORMANCE_AERODROMES } from "@/lib/performance/aerodromes";

export const runtime = "nodejs";

type Report = {status:"available"|"missing"|"error"; raw:string; note?:string};

async function getReport(icao:string, product:"metar"|"taf"):Promise<Report> {
  const url = "https://api.met.no/weatherapi/tafmetar/1.0/"+product+".txt?icao="+encodeURIComponent(icao);
  try {
    const response = await fetch(url,{
      headers:{
        "User-Agent":"Briefings-Next-Meteorology/1.0 (https://github.com/AlexandreMoiteiro/briefings-next)",
        "Accept":"text/plain"
      },
      next:{revalidate:600},
      signal:AbortSignal.timeout(9000)
    });
    if (response.status===204 || response.status===404) {
      return {status:"missing",raw:"",note:"Não foi encontrada uma mensagem atual para este aeródromo."};
    }
    if (!response.ok) {
      return {status:"error",raw:"",note:"A fonte MET Norway respondeu com HTTP "+response.status+"."};
    }
    const text = (await response.text()).trim();
    if (!text || !/[A-Z]{4}/.test(text) || !text.includes(icao)) {
      return {status:"missing",raw:"",note:"A fonte não devolveu mensagens para "+icao+"."};
    }
    return {status:"available",raw:text.slice(0,7000)};
  } catch {
    return {status:"error",raw:"",note:"Não foi possível contactar a fonte MET Norway. Tenta atualizar novamente."};
  }
}

export async function GET(request:NextRequest) {
  const icao = (request.nextUrl.searchParams.get("icao") || "").toUpperCase().trim();
  if (!Object.prototype.hasOwnProperty.call(PERFORMANCE_AERODROMES,icao)) {
    return NextResponse.json({error:"ICAO not enabled in Performance"},{status:400});
  }
  const [metar,taf] = await Promise.all([getReport(icao,"metar"),getReport(icao,"taf")]);
  return NextResponse.json(
    {icao,source:"MET Norway Tafmetar",checkedAt:new Date().toISOString(),metar,taf},
    {headers:{"Cache-Control":"private, max-age=0, no-store"}}
  );
}
