import { readAdminCode } from "@/lib/admin-session";
import { AdminLogin } from "./admin-login";
import { AdminDashboard } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const code = await readAdminCode();
  return code ? <AdminDashboard /> : <AdminLogin />;
}
