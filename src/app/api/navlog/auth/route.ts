import { NextResponse } from "next/server";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";
import { createNavlogAdminClient, deriveNavlogPassword, navlogAuthRateKey, navlogRequestIp, PIN_PATTERN, USERNAME_PATTERN } from "@/lib/navlog-pin-auth";
import { ensureNavlogEmailConfigured, navlogEmailTokenLink, sendNavlogAuthEmail } from "@/lib/navlog-auth-email";

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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Credentials;
  try {
    body = await request.json() as Credentials;
  } catch {
    return failure("Invalid request.");
  }

  if (!["signup", "login", "resend", "reset"].includes(body.action ?? "")) return failure("Invalid request.");
  const pin = body.pin ?? "";
  if ((body.action === "signup" || body.action === "login") && !PIN_PATTERN.test(pin)) {
    return failure("Use a PIN of exactly 4 numbers.");
  }

  try {
    const admin = createNavlogAdminClient();
    const client = createPublicServerSupabase();
    const ipHash = navlogRequestIp(request);

    if (body.action !== "login") {
      const email = (body.email ?? "").trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email) || email.length > 254) return failure("Enter a valid email address.");
      // Fail closed *before* creating an Auth user when the provider is not ready.
      ensureNavlogEmailConfigured();

      const { data: guard, error: guardError } = await admin.rpc("navlog_pin_attempt_guard", {
        p_identity_hash: navlogAuthRateKey(`${body.action}:${email}`), p_ip_hash: ipHash,
      });
      if (guardError || !guard?.[0]) throw guardError ?? new Error("Authentication rate limit is unavailable.");
      if (!guard[0].is_allowed) return failure("Too many email requests. Please try again in 15 minutes.", 429);

      if (body.action === "reset") {
        const { data, error } = await admin.auth.admin.generateLink({
          type: "recovery", email,
        });
        if (!error && data?.properties?.hashed_token) {
          await sendNavlogAuthEmail(email, navlogEmailTokenLink(data.properties.hashed_token, "recovery"), "recovery");
        }
        // Do not disclose whether an email address is registered.
        return json({ success: true });
      }

      if (body.action === "resend") {
        // Check that the account already exists. Generating a magic link for an
        // unknown address can create an Auth user, which would be undesirable.
        // Responses are identical whether an account exists or not.
        for (let page = 1; page <= 20; page++) {
          const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) throw usersError;
          const account = users.users.find((candidate) => candidate.email?.toLowerCase() === email);
          if (account) {
            if (!account.email_confirmed_at) {
              const { data, error } = await admin.auth.admin.generateLink({
                type: "magiclink", email,
              });
              if (error || !data?.properties?.hashed_token) throw error ?? new Error("Could not generate confirmation token.");
              await sendNavlogAuthEmail(email, navlogEmailTokenLink(data.properties.hashed_token, "confirm"), "confirm");
            }
            break;
          }
          if (users.users.length < 1000) break;
        }
        return json({ success: true });
      }

      const username = (body.username ?? "").trim();
      if (!USERNAME_PATTERN.test(username)) return failure("Username: 3–24 letters, numbers, dots, dashes or underscores.");

      const { data: existingProfile, error: usernameError } = await admin
        .from("navlog_user_profiles").select("user_id").ilike("username", username).maybeSingle();
      if (usernameError) throw usernameError;
      if (existingProfile) return failure("That username is already taken.", 409);

      const { data, error } = await admin.auth.admin.generateLink({
        type: "signup", email, password: deriveNavlogPassword(email, pin),
        options: { data: { username } },
      });
      if (error) return failure(error.message);
      if (!data?.properties?.hashed_token) throw new Error("No confirmation token returned.");
      await sendNavlogAuthEmail(email, navlogEmailTokenLink(data.properties.hashed_token, "confirm"), "confirm");
      return json({ success: true, requiresConfirmation: true, session: null });
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
