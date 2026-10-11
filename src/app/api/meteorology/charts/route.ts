import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xyyodgojcrdkleuyicjn.supabase.co";
const SECRET = process.env.AEMET_SUPABASE_SECRET;
const BUCKET = "aemet-charts";
const FLIGHTS = new Set(["020", "050", "100", "150"]);

type Entry = { name: string; validAt: string; runAt?: string; fl?: string; path: string };
function parse(name:string, kind:"sigwx"|"wind-temp"):Entry|null {
  if(kind==="sigwx") {
    const m=/^(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/.exec(name);
    if(!m)return null;
    const date=new Date(m[1]+"T"+m[2]+":00:00Z");
    if(!Number.isFinite(date.getTime()))return null;
    return {name,validAt:date.toISOString(),path:kind+"/"+name};
  }
  const m=/^(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/.exec(name);
  if(!m || !FLIGHTS.has(m[4]))return null;
  const run=new Date(m[1].slice(0,4)+"-"+m[1].slice(4,6)+"-"+m[1].slice(6,8)+"T"+m[2]+":00:00Z");
  if(!Number.isFinite(run.getTime()))return null;
  return {name,fl:m[4],runAt:run.toISOString(),validAt:new Date(run.getTime()+Number(m[3])*3600000).toISOString(),path:kind+"/"+name};
}
const headers=()=>({"apikey":SECRET||"","Authorization":"Bearer "+SECRET,"Content-Type":"application/json"});
async function list(kind:"sigwx"|"wind-temp") {
  const entries:Entry[]=[];
  for(let offset=0;offset<1000;offset+=100) {
    const response=await fetch(BASE+"/storage/v1/object/list/"+BUCKET,{
      method:"POST",headers:headers(),body:JSON.stringify({prefix:kind+"/",limit:100,offset,sortBy:{column:"name",order:"desc"}}),cache:"no-store"
    });
    if(!response.ok)throw Error("Storage listing HTTP "+response.status);
    const rows=await response.json() as Array<{name?:string;id?:string}>;
    for(const row of rows)if(row.name && row.id){const e=parse(row.name,kind);if(e)entries.push(e);}
    if(rows.length<100)break;
  }
  return entries;
}
export async function GET(request:NextRequest) {
  if(!SECRET)return NextResponse.json({error:"AEMET Storage não configurado nesta Preview."},{status:503});
  const image=request.nextUrl.searchParams.get("image");
  if(image){
    const pieces=image.split("/");
    if(pieces.length!==2 || (pieces[0]!=="sigwx"&&pieces[0]!=="wind-temp") || !parse(pieces[1],pieces[0] as "sigwx"|"wind-temp"))
      return NextResponse.json({error:"Imagem inválida"},{status:400});
    const path=pieces.join("/");
    const response=await fetch(BASE+"/storage/v1/object/authenticated/"+BUCKET+"/"+path,{
      headers:{"apikey":SECRET,"Authorization":"Bearer "+SECRET},cache:"no-store"
    });
    if(!response.ok)return NextResponse.json({error:"Imagem indisponível"},{status:response.status===404?404:502});
    const buffer=await response.arrayBuffer();
    return new NextResponse(buffer,{headers:{"Content-Type":"image/png","Cache-Control":"private, max-age=300","X-Content-Type-Options":"nosniff"}});
  }
  try{
    const [sigwx,wind]=await Promise.all([list("sigwx"),list("wind-temp")]);
    const current=Date.now(),low=current-86400000,high=current+86400000*2;
    const inside=(e:Entry)=>{const time=Date.parse(e.validAt);return time>=low&&time<=high;};
    const latest=new Map<string,Entry>();
    for(const item of wind.filter(inside)) {
      const key=item.validAt+"_"+item.fl;
      const old=latest.get(key);
      if(!old || (item.runAt||"")>(old.runAt||""))latest.set(key,item);
    }
    return NextResponse.json({sigwx:sigwx.filter(inside).sort((a,b)=>a.validAt.localeCompare(b.validAt)),wind:[...latest.values()].sort((a,b)=>a.validAt.localeCompare(b.validAt))},{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Não foi possível consultar a Supabase."},{status:502});}
}
