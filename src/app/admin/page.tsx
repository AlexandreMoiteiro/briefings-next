import { readAdminCode } from "@/lib/admin-session";
import { AdminLogin } from "./admin-login";
import { AdminOverview } from "./overview-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const code = await readAdminCode();
  return code ? <AdminOverview /> : <AdminLogin />;
}
