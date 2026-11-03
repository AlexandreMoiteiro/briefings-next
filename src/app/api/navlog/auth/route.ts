import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
import { createNavlogAdminClient, deriveNavlogPassword, navlogAuthRateKey, navlogRequestIp, PIN_PATTERN, USERNAME_PATTERN } from "@/lib/navlog-pin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Credentials = {
  action?: string;
  email?: string;
  username?: string;
  identifier?: string;
  pin?: string;
};

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function failure(message: string, status = 400) {
  return json({ error: message }, status);
}

const GENERIC_LOGIN_FAILURE = "Username/email or PIN is incorrect.";

export async function POST(request: Request) {
  let body: Credentials;
  try {
    body = await request.json() as Credentials;
  } catch {
    return failure("Invalid request.");
  }

  if (body.action !== "signup" && body.action !== "login") return failure("Invalid request.");
  const pin = body.pin ?? "";
  if (!PIN_PATTERN.test(pin)) return failure("Use a PIN of exactly 4 numbers.");

  try {
    const admin = createNavlogAdminClient();
    const client = createPublicServerSupabase();
    const ipHash = navlogRequestIp(request);

    if (body.action === "signup") {
      const email = (body.email ?? "").trim().toLowerCase();
      const username = (body.username ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return failure("Enter a valid email address.");
      if (!USERNAME_PATTERN.test(username)) return failure("Username: 3–24 letters, numbers, dots, dashes or underscores.");

      const { data: existingProfile, error: usernameError } = await admin
        .from("navlog_user_profiles").select("user_id").ilike("username", username).maybeSingle();
      if (usernameError) throw usernameError;
      if (existingProfile) return failure("That username is already taken.", 409);

      const { data: guard, error: guardError } = await admin.rpc("navlog_pin_attempt_guard", {
        p_identity_hash: navlogAuthRateKey(`signup:${email}`), p_ip_hash: ipHash,
      });
      if (guardError || !guard?.[0]) throw guardError ?? new Error("Authentication rate limit is unavailable.");
      if (!guard[0].is_allowed) return failure("Too many attempts. Please try again in 15 minutes.", 429);

      const { data, error } = await client.auth.signUp({
        email,
        password: deriveNavlogPassword(email, pin),
        options: { data: { username }, emailRedirectTo: `${new URL(request.url).origin}/navlog` },
      });
      if (error) return failure(error.message);
      return json({
        success: true,
        requiresConfirmation: !data.session,
        session: data.session ? { access_token: data.session.access_token, refresh_token: data.session.refresh_token } : null,
      });
    }

    const identifier = (body.identifier ?? "").trim();
    if (identifier.length < 3 || identifier.length > 254) return failure(GENERIC_LOGIN_FAILURE, 401);
    let email = identifier.toLowerCase();
    if (!email.includes("@")) {
      if (!USERNAME_PATTERN.test(identifier)) return failure(GENERIC_LOGIN_FAILURE, 401);
      const { data: profile, error: profileError } = await admin
        .from("navlog_user_profiles").select("user_id").ilike("username", identifier).maybeSingle();
      if (profileError) throw profileError;
      if (profile) {
        const { data: account, error: accountError } = await admin.auth.admin.getUserById(profile.user_id);
        if (accountError) throw accountError;
        email = account.user?.email?.toLowerCase() ?? identifier.toLowerCase();
      }
    }

    const identityHash = navlogAuthRateKey(`login:${email}`);
    const { data: guard, error: guardError } = await admin.rpc("navlog_pin_attempt_guard", {
      p_identity_hash: identityHash, p_ip_hash: ipHash,
    });
    if (guardError || !guard?.[0]) throw guardError ?? new Error("Authentication rate limit is unavailable.");
    if (!guard[0].is_allowed) return failure("Too many sign-in attempts. Try again in 15 minutes.", 429);

    // A user PIN never leaves this server for storage or Supabase Auth.
    const { data, error } = await client.auth.signInWithPassword({
      email, password: deriveNavlogPassword(email, pin),
    });
    if (error || !data.session) return failure(GENERIC_LOGIN_FAILURE, 401);

    await admin.rpc("navlog_pin_attempt_guard", {
      p_identity_hash: identityHash, p_ip_hash: ipHash, p_clear_identity: true,
    });
    return json({ success: true, session: {
      access_token: data.session.access_token, refresh_token: data.session.refresh_token,
    } });
  } catch (error) {
    console.error("NavLog authentication unavailable", error instanceof Error ? error.message : "Unknown error");
    return failure("NavLog sign-in is awaiting secure configuration or is temporarily unavailable.", 503);
  }
}
