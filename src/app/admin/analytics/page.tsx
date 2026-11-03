import { redirect } from "next/navigation";
import { readAdminCode } from "@/lib/admin-session";
import { AdminDashboard } from "../dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  if (!await readAdminCode()) redirect("/admin");
  return <AdminDashboard />;
}
