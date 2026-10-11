"use client";
import { useEffect, useState } from "react";

export function AemetAnnouncement(){
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    try{if(window.localStorage.getItem("briefings-aemet-feature-v3")!=="seen")setVisible(true);}
    catch{setVisible(true);}
  },[]);
  const dismiss=()=>{
    setVisible(false);
    try{window.localStorage.setItem("briefings-aemet-feature-v3","seen");}catch{}
  };
  if(!visible)return null;
  return <div role="dialog" aria-modal="true" aria-label="AEMET charts update"
    className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4">
    <div className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Briefings update</span>
      <h2 className="mt-3 text-xl font-bold text-zinc-950">AEMET weather charts</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-700">
        In response to requests from fellow pilots, I have introduced direct access to AEMET SIGWX and Wind & Temperature charts.
        This provides a more reliable way to consult these products when the AEMET website is difficult to access.
      </p>
      <p className="mt-3 text-xs text-zinc-500">Official chart source: © AEMET.</p>
      <button type="button" onClick={dismiss}
        className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white hover:bg-zinc-800">Continue to Briefings</button>
    </div>
  </div>;
}
