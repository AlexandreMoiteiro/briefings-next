import { redirect } from "next/navigation";
import { readAdminCode } from "@/lib/admin-session";
import { AdminMessagesPanel } from "./panel";
export const dynamic = "force-dynamic";
export default async function MessagesPage() {
  if (!(await readAdminCode())) redirect("/admin");
  return <AdminMessagesPanel />;
}
