import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "briefings_admin_session";
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

function sessionKey() {
  const secret = process.env.AEMET_SUPABASE_SECRET;
  if (!secret) throw new Error("Admin session secret not configured.");
  return createHash("sha256").update("briefings-admin-session-v2:" + secret).digest();
}

function encryptAdminCode(code: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sessionKey(), iv);
  const payload = JSON.stringify({ code, expiresAt: Date.now() + SESSION_DURATION_MS });
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptAdminCode(value: string): string | null {
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", sessionKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8")) as {
      code?: unknown;
      expiresAt?: unknown;
    };
    if (typeof payload.code !== "string" || typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()) return null;
    return payload.code;
  } catch {
    return null;
  }
}

export async function readAdminCode(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(COOKIE)?.value;
  return value ? decryptAdminCode(value) : null;
}

export async function setAdminSession(code: string) {
  const store = await cookies();
  store.set(COOKIE, encryptAdminCode(code), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(COOKIE);
}
