import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
}

function hashIp(ip: string) {
  return createHash("sha256").update(`briefings-ip-v1|${ip}`).digest("hex");
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const ipHash = ip ? hashIp(ip) : null;

  let clientId = "";
  try {
    const body = (await request.json()) as { clientId?: unknown };
    if (typeof body.clientId === "string") clientId = body.clientId.trim().slice(0, 200);
  } catch {
    clientId = "";
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ allowed: true, ipHash });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("is_app_export_blocked", {
    p_ip_hash: ipHash ?? "",
    p_client_id: clientId,
  });

  if (error) {
    console.warn("Could not verify export block:", error.message);
    return NextResponse.json({ allowed: true, ipHash });
  }

  return NextResponse.json({
    allowed: !Boolean(data),
    ipHash,
  });
}
