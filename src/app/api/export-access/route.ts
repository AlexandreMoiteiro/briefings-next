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
  if (!ip) {
    return NextResponse.json({ allowed: true, ipHash: null });
  }

  const ipHash = hashIp(ip);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ allowed: true, ipHash });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("is_app_ip_banned", {
    p_ip_hash: ipHash,
  });

  if (error) {
    console.warn("Could not verify export IP ban:", error.message);
    return NextResponse.json({ allowed: true, ipHash });
  }

  return NextResponse.json({
    allowed: !Boolean(data),
    ipHash,
  });
}
