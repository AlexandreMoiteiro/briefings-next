import { redirect } from "next/navigation";

// Requests are managed alongside feedback in one inbox.
export default function UnblockRequestsRedirect() {
  redirect("/admin/messages");
}
