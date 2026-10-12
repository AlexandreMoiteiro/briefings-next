import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";

const noCache={"Cache-Control":"no-store"};
export async function GET(){
  const response=NextResponse.json({error:"Enter the admin code to sign in."},{status:401,headers:noCache});
  response.cookies.set("briefings_admin_session","",{path:"/",maxAge:0});
  return response;
}
export async function POST(request:Request){
  try{
    const body=await request.json() as {code?:unknown};
    const code=typeof body.code==="string"?body.code.trim():"";
    if(!code||code.length>256)return NextResponse.json({error:"Invalid admin code"},{status:401});
    const db=createPublicServerSupabase();
    const [usage,daily]=await Promise.all([
      db.rpc("get_app_usage_events_admin",{p_admin_code:code,p_limit:500}),
      db.rpc("get_page_open_counts_admin",{p_admin_code:code,p_days:30}),
    ]);
    if(usage.error||daily.error)return NextResponse.json({error:"Invalid admin code"},{status:401,headers:noCache});
    const response=NextResponse.json({rows:usage.data??[],pageOpens:daily.data??[]},{headers:noCache});
    response.cookies.set("briefings_admin_session","",{path:"/",maxAge:0});
    return response;
  }catch{return NextResponse.json({error:"Unable to sign in."},{status:400,headers:noCache});}
}
export async function DELETE(){
 const response=new NextResponse(null,{status:204,headers:noCache});
 response.cookies.set("briefings_admin_session","",{path:"/",maxAge:0});
 return response;
}
