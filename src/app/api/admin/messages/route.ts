import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noCache={"Cache-Control":"no-store"};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function GET(){return NextResponse.json({error:"Admin code required"},{status:401,headers:noCache});}
export async function POST(request:Request){
 try{
  const body=await request.json() as {code?:unknown;action?:unknown;id?:unknown;status?:unknown;clientId?:unknown;ipHash?:unknown};
  const code=typeof body.code==="string"?body.code.trim():"";
  const action=typeof body.action==="string"?body.action:"";
  if(!code||code.length>256)return NextResponse.json({error:"Admin code required"},{status:401,headers:noCache});
  const db=createPublicServerSupabase();
  if(action==="list"){
    const [feedback,unblock]=await Promise.all([
     db.rpc("get_app_feedback_messages_admin",{p_admin_code:code,p_limit:300}),
     db.rpc("get_app_unblock_requests_admin",{p_admin_code:code,p_limit:300}),
    ]);
    if(feedback.error||unblock.error)return NextResponse.json({error:"Invalid admin code"},{status:401,headers:noCache});
    return NextResponse.json({feedback:feedback.data??[],unblock:unblock.data??[]},{headers:noCache});
  }
  const id=typeof body.id==="string"?body.id:"";
  const status=typeof body.status==="string"?body.status:"";
  const clientId=typeof body.clientId==="string"?body.clientId:"";
  const ipHash=typeof body.ipHash==="string"?body.ipHash:"";
  let result:{error:unknown}|null=null;
  if(action==="feedback-status"&&UUID.test(id)&&["open","read","resolved"].includes(status))
    result=await db.rpc("set_app_feedback_message_status_admin",{p_admin_code:code,p_message_id:id,p_status:status});
  else if(action==="unblock-status"&&UUID.test(id)&&["open","reviewed","resolved"].includes(status))
    result=await db.rpc("set_app_unblock_request_status_admin",{p_admin_code:code,p_request_id:id,p_status:status});
  else if(action==="unblock-device"&&clientId.length>0&&clientId.length<=200)
    result=await db.rpc("set_app_client_ban_admin",{p_admin_code:code,p_client_id:clientId,p_banned:false,p_reason:null});
  else if(action==="unblock-network"&&/^[0-9a-f]{64}$/i.test(ipHash))
    result=await db.rpc("set_app_ip_ban_admin",{p_admin_code:code,p_ip_hash:ipHash,p_banned:false,p_reason:null});
  else return NextResponse.json({error:"Invalid action"},{status:400,headers:noCache});
  if(result?.error)return NextResponse.json({error:"Unable to complete action or invalid admin code"},{status:403,headers:noCache});
  if(action==="unblock-device"&&UUID.test(id))
    await db.rpc("set_app_unblock_request_status_admin",{p_admin_code:code,p_request_id:id,p_status:"resolved"});
  return new NextResponse(null,{status:204,headers:noCache});
 }catch{return NextResponse.json({error:"Unable to complete request"},{status:400,headers:noCache});}
}
