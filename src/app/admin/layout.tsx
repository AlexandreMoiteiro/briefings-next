import type { ReactNode } from "react";
import { readAdminCode } from "@/lib/admin-session";
import { AdminShell } from "./admin-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const authenticated = Boolean(await readAdminCode());
  return authenticated ? <AdminShell>{children}</AdminShell> : <>{children}</>;
}
