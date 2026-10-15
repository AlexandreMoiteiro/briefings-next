import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";
import { createClient } from "npm:@supabase/supabase-js@2";

const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const AUDIENCE = "briefings-aemet-charts";
const REPO = "AlexandreMoiteiro/briefings-next";
const WORKFLOW = REPO + "/.github/workflows/aemet-charts.yml@";
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_BYTES = 15 * 1024 * 1024;
const SIGWX = /^sigwx\/(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/;
const WIND = /^wind-temp\/(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/;

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
    const ms = Date.parse(v.slice(0, 4) + "-" + v.slice(4, 6) + "-" +
                          v.slice(6) + "T" + wind[2] + ":00:00Z");
    return Number.isFinite(ms) && ms > now - 36 * 3600000 && ms < now + 6 * 3600000;
  }
  return false;
}

function adminKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default !== "string" || !keys.default) throw new Error("Admin key unavailable");
  return keys.default;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const jwt = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!jwt) return Response.json({ error: "Missing workflow token" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: AUDIENCE,
      clockTolerance: 30,
    });
    if (payload.repository !== REPO) throw new Error("Repository mismatch");
    const ref = payload.ref;
    const wf = payload.workflow_ref;
    const event = payload.event_name;
    const accepted =
      (ref === "refs/heads/main" && wf === WORKFLOW + ref &&
        (event === "schedule" || event === "workflow_dispatch")) ||
      (ref === "refs/heads/preview/meteorology-current-app" && wf === WORKFLOW + ref &&
        (event === "push" || event === "workflow_dispatch"));
    if (!accepted) throw new Error("Unexpected workflow ref/event");
  } catch {
    return Response.json({ error: "Workflow identity rejected" }, { status: 403 });
  }

  const path = new URL(request.url).searchParams.get("path") || "";
  if (!allowedPath(path)) return Response.json({ error: "Invalid chart path or date" }, { status: 400 });
  const announced = Number(request.headers.get("content-length") || 0);
  if (announced > MAX_BYTES) return Response.json({ error: "PNG too large" }, { status: 413 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length < 32 || body.length > MAX_BYTES || !PNG.every((v, i) => body[i] === v)) {
    return Response.json({ error: "Invalid PNG" }, { status: 415 });
  }
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const width = view.getUint32(16, false), height = view.getUint32(20, false);
  if (width < 400 || width > 10000 || height < 400 || height > 10000) {
    return Response.json({ error: "Invalid PNG dimensions" }, { status: 415 });
  }

  const base = Deno.env.get("SUPABASE_URL");
  if (!base) return Response.json({ error: "Supabase URL unavailable" }, { status: 503 });
  const admin = createClient(base, adminKey(), { auth: { persistSession: false } });
  const uploaded = await admin.storage.from("aemet-charts").upload(path, body, {
    upsert: true,
    contentType: "image/png",
    cacheControl: "300",
  });
  if (uploaded.error) return Response.json({ error: "Storage upload rejected" }, { status: 502 });
  return Response.json({ stored: true, path }, { headers: { "Cache-Control": "no-store" } });
});
