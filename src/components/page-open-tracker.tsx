"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { logUsageEvent } from "@/lib/usage-events";

export function PageOpenTracker(){
  const pathname=usePathname();
  useEffect(()=>{
    if(pathname==="/meteorology")void logUsageEvent({eventType:"meteorology_open",module:"meteorology"});
    if(pathname==="/notam-map")void logUsageEvent({eventType:"notam_map_open",module:"notam-map"});
  },[pathname]);
  return null;
}
