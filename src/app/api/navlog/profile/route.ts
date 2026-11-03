import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;

function respond(body: object, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  // Only the server validates the bearer token and determines the profile owner.
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "");
  const accessToken = match?.[1]?.trim();
  if (!accessToken) return respond({ error: "Please sign in with Google first." }, 401);

  let username: string;
  try {
    const body = await request.json() as { username?: unknown };
    username = typeof body.username === "string" ? body.username.trim() : "";
  } catch {
    return respond({ error: "Invalid request." }, 400);
  }
  if (!USERNAME_PATTERN.test(username)) {
    return respond({ error: "Use 3–24 letters, numbers, dots, dashes or underscores." }, 400);
  }

  try {
    const publicClient = createPublicServerSupabase();
    const { data: { user }, error: identityError } = await publicClient.auth.getUser(accessToken);
    if (identityError || !user) return respond({ error: "Session expired. Sign in again." }, 401);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secretKey) throw new Error("Private Supabase configuration is missing.");

    const adminClient = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    // The user_id always comes from Supabase's verified user, never the request body.
    const { data, error } = await adminClient
      .from("navlog_user_profiles")
      .upsert({ user_id: user.id, username }, { onConflict: "user_id" })
      .select("username")
      .single();

    if (error?.code === "23505") return respond({ error: "This username is already taken." }, 409);
    if (error || !data) throw error ?? new Error("Username could not be saved.");
    return respond({ username: data.username });
  } catch (error) {
    console.error("NavLog profile save failed", error instanceof Error ? error.message : "Unknown error");
    return respond({ error: "Unable to save the username right now." }, 503);
  }
}
