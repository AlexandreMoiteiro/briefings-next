import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function context(){
  const code=await readAdminCode();
  if(!code)throw Error("Unauthorized");
  return {code,db:createPublicServerSupabase()};
}
export async function GET(){
  try{
    const {code,db}=await context();
    const {data,error}=await db.rpc("get_app_usage_events_admin",{p_admin_code:code,p_limit:500});
    if(error)throw Error("Unauthorized");
    const seen=new Map<string,{client_id:string;ip_hash:string|null;client_banned:boolean;ip_banned:boolean;last_seen:string}>();
    for(const row of data??[]){
      if(!row.client_id || row.client_id==="anonymous-page-open" || seen.has(row.client_id))continue;
      seen.set(row.client_id,{client_id:row.client_id,ip_hash:row.ip_hash||null,client_banned:Boolean(row.client_banned),ip_banned:Boolean(row.ip_banned),last_seen:row.created_at});
    }
    return NextResponse.json({clients:[...seen.values()]},{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Unauthorized"},{status:401});}
}
export async function POST(request:Request){
  try{
    const {code,db}=await context();
    const body=await request.json() as {kind?:unknown;id?:unknown;banned?:unknown};
    if((body.kind!=="client"&&body.kind!=="network") || typeof body.id!=="string" || body.id.length>200 || !body.id || typeof body.banned!=="boolean")
      return NextResponse.json({error:"Invalid request"},{status:400});
    if(body.kind==="network" && !/^[0-9a-f]{64}$/i.test(body.id))return NextResponse.json({error:"Invalid network identifier"},{status:400});
    const result=body.kind==="client"
      ?await db.rpc("set_app_client_ban_admin",{p_admin_code:code,p_client_id:body.id,p_banned:body.banned,p_reason:body.banned?"Admin export access management":null})
      :await db.rpc("set_app_ip_ban_admin",{p_admin_code:code,p_ip_hash:body.id,p_banned:body.banned,p_reason:body.banned?"Admin export access management":null});
    if(result.error)throw Error("Update failed");
    return new NextResponse(null,{status:204});
  }catch{return NextResponse.json({error:"Could not update export access"},{status:403});}
}
