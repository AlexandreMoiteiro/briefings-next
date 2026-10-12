"use client";
import {useEffect,useState} from "react";
type Client={client_id:string;ip_hash:string|null;client_banned:boolean;ip_banned:boolean;last_seen:string};
export function ExportAccessPanel({adminCode}:{adminCode:string}){
 const [clients,setClients]=useState<Client[]>([]);
 const [state,setState]=useState<"loading"|"ready"|"unauthorized"|"error">("loading");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [search,setSearch]=useState("");
 async function refresh(){
  try{
   const res=await fetch("/api/admin/export-access",{method:"POST",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"list",code:adminCode})});
   if(res.status===401){setState("unauthorized");return;}
   if(!res.ok)throw Error("Unable to retrieve access records.");
   const value=await res.json() as {clients:Client[]};
   setClients(value.clients||[]);setState("ready");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load export access.");setState("error");}
 }
 useEffect(()=>{void refresh();},[]);
 async function toggle(kind:"client"|"network",id:string,banned:boolean){
  if(!window.confirm((banned?"Block":"Unblock")+" "+(kind==="client"?"this device":"this network")+" for PDF exports?"))return;
  setBusy(kind+id);setError("");
  try{
   const res=await fetch("/api/admin/export-access",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"toggle",code:adminCode,kind,id,banned})});
   if(!res.ok)throw Error("Unable to update export access.");
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Update failed.");}finally{setBusy("");}
 }
 const filtered=clients.filter(c=>c.client_id.toLowerCase().includes(search.toLowerCase()) || (c.ip_hash||"").includes(search.toLowerCase()));
 return <main className="mx-auto max-w-5xl space-y-5">
  <header className="space-y-2">
   <h1 className="text-3xl font-semibold">Export Access</h1>
   <p className="text-sm text-zinc-600">Manage PDF export permissions for devices and networks recorded in recent usage events. Network blocks may affect other users sharing the same connection.</p>
  </header>
  {state==="loading"?<p className="text-sm text-zinc-600">Checking admin session…</p>:
   state==="unauthorized"?<div className="rounded-2xl border bg-white p-5 text-sm">Unable to access export permissions.</div>:
   state==="error"?<p role="alert" className="text-sm text-red-700">{error}</p>:
   <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3">
     <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search device or network identifier" className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"/>
     <button onClick={()=>void refresh()} type="button" className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium">Refresh</button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-zinc-500">Latest {clients.length} devices found in up to 500 recent usage events. Only export restrictions are changed.</p>
    {filtered.map(c=><article key={c.client_id} className="rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="min-w-0 flex-1 space-y-1">
        <p className="break-all text-xs font-semibold text-zinc-900">Device: {c.client_id}</p>
        <p className="break-all text-xs text-zinc-500">Network identifier: {c.ip_hash||"Unavailable"}</p>
        <p className="text-xs text-zinc-500">Last event: {new Date(c.last_seen).toLocaleString("en-GB")}</p>
       </div>
       <div className="flex flex-wrap gap-2">
        <button disabled={Boolean(busy)} onClick={()=>void toggle("client",c.client_id,!c.client_banned)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
         {c.client_banned?"Unblock device":"Block device"}
        </button>
        {c.ip_hash&&<button disabled={Boolean(busy)} onClick={()=>void toggle("network",c.ip_hash!,!c.ip_banned)} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">
         {c.ip_banned?"Unblock network":"Block network"}
        </button>}
       </div>
      </div>
    </article>)}
    {filtered.length===0&&<p className="rounded-2xl border bg-white p-5 text-sm text-zinc-500">No matching devices found.</p>}
   </div>}
 </main>;
}
