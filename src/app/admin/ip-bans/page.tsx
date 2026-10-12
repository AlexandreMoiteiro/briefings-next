import { redirect } from "next/navigation";
import { readAdminCode } from "@/lib/admin-session";
import { AdminIpBansClient } from "./client";
export const dynamic = "force-dynamic";
export default async function ExportAccessPage(){
  if (!(await readAdminCode())) redirect("/admin");
  return <AdminIpBansClient />;
}
