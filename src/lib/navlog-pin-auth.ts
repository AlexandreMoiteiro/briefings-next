import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PIN_PATTERN = /^[0-9]{4}$/;
export const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;

function requirePinSecret() {
  const pepper = process.env.NAVLOG_PIN_PEPPER;
  if (!pepper || pepper.length < 32) {
    throw new Error("NavLog PIN access is awaiting secure configuration.");
  }
  return pepper;
}

export function createNavlogAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NavLog PIN access is awaiting secure configuration.");
  }
  requirePinSecret();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function deriveNavlogPassword(email: string, pin: string) {
  if (!PIN_PATTERN.test(pin)) throw new Error("Your PIN must have exactly 4 numbers.");
  const normalized = email.trim().toLowerCase();
  // Domain separation: a PIN or email is never sent as the Supabase password.
  return `briefings-pin-v1-${createHmac("sha256", requirePinSecret())
    .update(`password:${normalized}:${pin}`)
    .digest("hex")}`;
}

export function navlogAuthRateKey(value: string) {
  return createHmac("sha256", requirePinSecret()).update(`rate:${value}`).digest("hex");
}

export function navlogRequestIp(request: Request) {
  // Vercel's trusted forwarding header; use this only for supplemental limits.
  const candidate = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  return navlogAuthRateKey(`ip:${candidate.trim()}`);
}
