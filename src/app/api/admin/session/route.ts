import { NextResponse } from "next/server";
import { clearAdminSession, fetchAdminUsage, readAdminCode, setAdminSession } from "@/lib/admin-session";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  const code=await readAdminCode();
  if(!code)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{return NextResponse.json(await fetchAdminUsage(code),{headers:{"Cache-Control":"no-store"}});}
  catch{await clearAdminSession();return NextResponse.json({error:"Session expired"},{status:401});}
}
export async function POST(request:Request){
  try{
    const body=await request.json() as {code?:unknown};
    const code=typeof body.code==="string"?body.code.trim():"";
    if(!code || code.length>256)return NextResponse.json({error:"Invalid admin code"},{status:400});
    const data=await fetchAdminUsage(code);
    await setAdminSession(code);
    return NextResponse.json(data,{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Invalid admin code"},{status:401});}
}
export async function DELETE(){
  await clearAdminSession();
  return new NextResponse(null,{status:204});
}
