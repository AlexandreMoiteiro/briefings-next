import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noCache={"Cache-Control":"no-store"};
export async function GET(){return NextResponse.json({error:"Admin code required"},{status:401,headers:noCache});}
export async function POST(request:Request){
  try{
    const body=await request.json() as {code?:unknown;action?:unknown;kind?:unknown;id?:unknown;banned?:unknown};
    const code=typeof body.code==="string"?body.code.trim():"";
    if(!code||code.length>256)return NextResponse.json({error:"Admin code required"},{status:401,headers:noCache});
    const db=createPublicServerSupabase();
    if(body.action==="list"){
      const {data,error}=await db.rpc("get_app_usage_events_admin",{p_admin_code:code,p_limit:500});
      if(error)return NextResponse.json({error:"Invalid admin code"},{status:401,headers:noCache});
      const seen=new Map<string,{client_id:string;ip_hash:string|null;client_banned:boolean;ip_banned:boolean;last_seen:string}>();
      for(const row of data??[]){
        if(!row.client_id || row.client_id==="anonymous-page-open" || seen.has(row.client_id))continue;
        seen.set(row.client_id,{client_id:row.client_id,ip_hash:row.ip_hash||null,client_banned:Boolean(row.client_banned),ip_banned:Boolean(row.ip_banned),last_seen:row.created_at});
      }
      return NextResponse.json({clients:[...seen.values()]},{headers:noCache});
    }
    if(body.action!=="toggle" ||(body.kind!=="client"&&body.kind!=="network")||typeof body.id!=="string"||body.id.length>200||!body.id||typeof body.banned!=="boolean")
      return NextResponse.json({error:"Invalid action"},{status:400,headers:noCache});
    if(body.kind==="network"&&!/^[0-9a-f]{64}$/i.test(body.id))return NextResponse.json({error:"Invalid network identifier"},{status:400,headers:noCache});
    const result=body.kind==="client"
      ?await db.rpc("set_app_client_ban_admin",{p_admin_code:code,p_client_id:body.id,p_banned:body.banned,p_reason:body.banned?"Admin export access management":null})
      :await db.rpc("set_app_ip_ban_admin",{p_admin_code:code,p_ip_hash:body.id,p_banned:body.banned,p_reason:body.banned?"Admin export access management":null});
    if(result.error)return NextResponse.json({error:"Unable to update export access or invalid admin code"},{status:403,headers:noCache});
    return new NextResponse(null,{status:204,headers:noCache});
  }catch{return NextResponse.json({error:"Could not update export access"},{status:400,headers:noCache});}
}
