import { redirect } from "next/navigation";
import { readAdminCode } from "@/lib/admin-session";
import { AdminAccountsPanel } from "./panel";

export const dynamic = "force-dynamic";

export default async function AdminAccountsPage() {
  if (!(await readAdminCode())) redirect("/admin");
  return <AdminAccountsPanel />;
}
