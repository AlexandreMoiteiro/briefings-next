import { createClient } from "npm:@supabase/supabase-js@2";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const SIGWX = /^sigwx\/(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/;
const WIND = /^wind-temp\/(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/;
const MAX_BYTES = 5 * 1024 * 1024;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function allowedPath(path: string): boolean {
  const now = Date.now();
  const sig = SIGWX.exec(path);
  if (sig) {
    const ms = Date.parse(sig[1] + "T" + sig[2] + ":00:00Z");
    return Number.isFinite(ms) && ms > now - 24 * 3600000 && ms < now + 42 * 3600000;
  }
  const wind = WIND.exec(path);
  if (wind) {
    const v = wind[1];
    const ms = Date.parse(v.slice(0, 4) + "-" + v.slice(4, 6) + "-" + v.slice(6) + "T" + wind[2] + ":00:00Z");
    return Number.isFinite(ms) && ms > now - 36 * 3600000 && ms < now + 6 * 3600000;
  }
  return false;
}

async function isAuthorized(request: Request): Promise<boolean> {
  const match = /^Bearer\s+([^\s]{32,256})$/i.exec(request.headers.get("authorization") || "");
  if (!match) return false;
  const expected = Deno.env.get("AEMET_UPLOAD_TOKEN");
  if (!expected || expected.length < 32) return false;
  const encoder = new TextEncoder();
  const [actualHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(match[1])),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const actual = new Uint8Array(actualHash);
  const trusted = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual[i] ^ trusted[i];
  return difference === 0;
}

function adminKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default !== "string" || !keys.default) throw new Error("Admin key unavailable");
  return keys.default;
}

function alreadyExists(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; error?: string; name?: string; message?: string; statusCode?: number | string };
  const code = String(e.code || e.error || e.name || "");
  const message = String(e.message || "").toLowerCase();
  return ["Duplicate", "ResourceAlreadyExists", "KeyAlreadyExists"].includes(code) ||
    (["400", "409"].includes(String(e.statusCode)) &&
      (message.includes("already exists") || message.includes("duplicate")));
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!await isAuthorized(request)) return json({ error: "Unauthorized" }, 401);
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!allowedPath(path)) return json({ error: "Invalid chart path or date" }, 400);
  if ((Number(request.headers.get("content-length")) || 0) > MAX_BYTES) return json({ error: "PNG too large" }, 413);
  try {
    const png = new Uint8Array(await request.arrayBuffer());
    if (png.length < 32 || png.length > MAX_BYTES || !SIGNATURE.every((byte, i) => png[i] === byte))
      return json({ error: "Invalid PNG" }, 415);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const width = view.getUint32(16, false), height = view.getUint32(20, false);
    if (width < 400 || height < 400 || width > 10000 || height > 10000)
      return json({ error: "Invalid PNG dimensions" }, 415);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
      auth: { persistSession: false },
    });

    // Cada carta AEMET é imutável para um dado nome. Não reescrever o mesmo
    // objeto a cada passagem do cron (mantém os bytes e o created_at originais).
    const result = await supabase.storage.from("aemet-charts").upload(path, png, {
      upsert: false,
      contentType: "image/png",
      cacheControl: "300",
    });
    if (result.error) {
      if (alreadyExists(result.error)) return json({ stored: false, alreadyStored: true, path });
      console.error("AEMET storage upload rejected:", result.error.message);
      return json({ error: "Storage upload rejected" }, 502);
    }
    return json({ stored: true, path, bytes: png.length });
  } catch (error) {
    console.error("AEMET Cloudflare receiver failed:", String(error));
    return json({ error: "Upload failed" }, 500);
  }
});
