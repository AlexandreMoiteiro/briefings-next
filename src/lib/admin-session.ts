import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

const COOKIE="briefings_admin_session";
const MAX_AGE=60*60*24*30;
function key(){
  const secret=process.env.AEMET_SUPABASE_SECRET;
  if(!secret)throw new Error("Admin session encryption is not configured.");
  return createHash("sha256").update("briefings-admin-session-v1:"+secret).digest();
}
function encode(code:string){
  const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
  const encrypted=Buffer.concat([cipher.update(code,"utf8"),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString("base64url");
}
function decode(value:string){
  try{
    const buffer=Buffer.from(value,"base64url");
    if(buffer.length<29)return null;
    const decipher=createDecipheriv("aes-256-gcm",key(),buffer.subarray(0,12));
    decipher.setAuthTag(buffer.subarray(12,28));
    return Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString("utf8");
  }catch{return null;}
}
export async function readAdminCode(){
  const jar=await cookies();
  const value=jar.get(COOKIE)?.value;
  return value?decode(value):null;
}
export async function setAdminSession(code:string){
  const jar=await cookies();
  jar.set(COOKIE,encode(code),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",maxAge:MAX_AGE,path:"/"});
}
export async function clearAdminSession(){
  const jar=await cookies();
  jar.delete(COOKIE);
}
export async function fetchAdminUsage(code:string){
  const supabase=createPublicServerSupabase();
  const {data,error}=await supabase.rpc("get_app_usage_events_admin",{p_admin_code:code,p_limit:500});
  if(error)throw new Error("Unauthorized");
  const {data:daily,error:dailyError}=await supabase.rpc("get_page_open_counts_admin",{p_admin_code:code,p_days:30});
  return {rows:data??[],pageOpens:daily??[],pageOpensError:dailyError?"Daily page counts are unavailable.":""};
}
