import { redirect } from "next/navigation";
import { readAdminCode } from "@/lib/admin-session";
import { AdminNavlogRoutes } from "./routes-client";

export const dynamic = "force-dynamic";

export default async function AdminNavlogRoutesPage() {
  if (!(await readAdminCode())) redirect("/admin");
  return <AdminNavlogRoutes />;
}
