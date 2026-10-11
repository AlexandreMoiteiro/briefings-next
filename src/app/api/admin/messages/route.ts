import { NextResponse } from "next/server";
import { readAdminCode } from "@/lib/admin-session";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function admin(){
 const code=await readAdminCode();
 if(!code)throw new Error("Unauthorized");
 return {code,client:createPublicServerSupabase()};
}
export async function GET(){
 try{
  const {code,client}=await admin();
  const [feedback,unblock]=await Promise.all([
   client.rpc("get_app_feedback_messages_admin",{p_admin_code:code,p_limit:300}),
   client.rpc("get_app_unblock_requests_admin",{p_admin_code:code,p_limit:300})
  ]);
  if(feedback.error||unblock.error)throw new Error("Unable to fetch admin messages");
  return NextResponse.json({feedback:feedback.data??[],unblock:unblock.data??[]},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Unable to load inbox. Please sign in through Admin."},{status:401});}
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 try{
  const {code,client}=await admin();
  const body=await request.json() as {action?:string;id?:string;status?:string;clientId?:string;ipHash?:string};
  let operation:PromiseLike<{error:unknown}> | null=null;
  switch(body.action){
   case "feedback-status":
    if(!UUID.test(body.id||"")||!["open","read","resolved"].includes(body.status||""))break;
    operation=client.rpc("set_app_feedback_message_status_admin",{p_admin_code:code,p_message_id:body.id,p_status:body.status});break;
   case "unblock-status":
    if(!UUID.test(body.id||"")||!["open","reviewed","resolved"].includes(body.status||""))break;
    operation=client.rpc("set_app_unblock_request_status_admin",{p_admin_code:code,p_request_id:body.id,p_status:body.status});break;
   case "unblock-device":
    if(!body.clientId || body.clientId.length>200)break;
    operation=client.rpc("set_app_client_ban_admin",{p_admin_code:code,p_client_id:body.clientId,p_banned:false,p_reason:null});break;
   case "unblock-network":
    if(!body.ipHash || !/^[0-9a-f]{64}$/i.test(body.ipHash))break;
    operation=client.rpc("set_app_ip_ban_admin",{p_admin_code:code,p_ip_hash:body.ipHash,p_banned:false,p_reason:null});break;
  }
  if(!operation)return NextResponse.json({error:"Invalid action"},{status:400});
  const result=await operation;
  if(result.error)return NextResponse.json({error:"Unable to complete action"},{status:500});
  if(body.action==="unblock-device" && UUID.test(body.id||"")){
   await client.rpc("set_app_unblock_request_status_admin",{p_admin_code:code,p_request_id:body.id,p_status:"resolved"});
  }
  return new NextResponse(null,{status:204});
 }catch{return NextResponse.json({error:"Unauthorized"},{status:401});}
}
