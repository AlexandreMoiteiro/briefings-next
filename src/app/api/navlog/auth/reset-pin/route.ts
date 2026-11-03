import { NextResponse } from "next/server";
import { createNavlogAdminClient, deriveNavlogPassword, PIN_PATTERN } from "@/lib/navlog-pin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return NextResponse.json({ error: "Invalid reset session." }, { status: 401 });
  let pin: string;
  try {
    const body = await request.json() as { pin?: string };
    pin = body.pin ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!PIN_PATTERN.test(pin)) return NextResponse.json({ error: "Use exactly 4 numbers." }, { status: 400 });

  try {
    const admin = createNavlogAdminClient();
    const { data, error } = await admin.auth.getUser(authorization.slice("Bearer ".length));
    if (error || !data.user?.email) return NextResponse.json({ error: "Reset link expired. Please request a new one." }, { status: 401 });
    const { error: updateError } = await admin.auth.admin.updateUserById(data.user.id, {
      password: deriveNavlogPassword(data.user.email, pin),
    });
    if (updateError) throw updateError;
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("NavLog PIN reset error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not update your PIN. Try again shortly." }, { status: 503 });
  }
}
