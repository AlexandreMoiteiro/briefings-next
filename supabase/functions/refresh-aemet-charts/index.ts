import { createClient } from "npm:@supabase/supabase-js@2";

const AEMET_SIGWX = "https://ama.aemet.es/o/estaticos/bbdd/imagenes/";
const AEMET_WIND = "https://ama.aemet.es/o/estaticos/productos/atap/";
const BUCKET = "aemet-charts";
const levels = ["020", "050", "100", "150"];
const PNG = [137, 80, 78, 71, 13, 10, 26, 10];
const MAX_BYTES = 15 * 1024 * 1024;

type Chart = { path: string; url: string };
type Result = { uploaded: number; alreadyStored: number; notPublished: number; errors: string[] };

const pad = (n: number, size = 2) => String(n).padStart(size, "0");
const day = (d: Date) => d.toISOString().slice(0, 10);
const compactDay = (d: Date) => day(d).replaceAll("-", "");
const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3600000);

function candidates(now: Date, kind: "sigwx" | "wind-temp"): Chart[] {
  const output: Chart[] = [];
  if (kind === "sigwx") {
    const floor = new Date(now);
    floor.setUTCHours(Math.floor(now.getUTCHours() / 6) * 6, 0, 0, 0);
    for (let n = -1; n <= 4; n++) {
      const valid = addHours(floor, n * 6);
      const issued = addHours(valid, -12);
      const filename = "QGQE70LEMM" + pad(issued.getUTCHours()) + "00________" + compactDay(issued) + ".png";
      output.push({
        path: "sigwx/" + day(valid) + "_" + pad(valid.getUTCHours()) + ".png",
        url: AEMET_SIGWX + filename,
      });
    }
  } else {
    const run = new Date(now);
    run.setUTCHours(now.getUTCHours() >= 12 ? 12 : 0, 0, 0, 0);
    // Keep the previous cycle while the fresh model is being published.
    const runs = now.getTime() - run.getTime() < 5 * 3600000 ? [addHours(run, -12), run] : [run];
    for (const cycle of runs) {
      const date = compactDay(cycle);
      const hh = pad(cycle.getUTCHours());
      for (let lead = 3; lead <= 30; lead += 3) {
        for (const fl of levels) {
          const ll = pad(lead, 3);
          output.push({
            path: "wind-temp/" + date + "_HMAR" + hh + "_H" + ll + "_FL" + fl + ".png",
            url: AEMET_WIND + date + "/HMAR/" + hh + "/P3/" + ll + "/VTPLOT_FL" + fl + "__.1.png",
          });
        }
      }
    }
  }
  return output;
}

async function retrieve(chart: Chart): Promise<Uint8Array | null> {
  const response = await fetch(chart.url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129 Safari/537.36",
      Accept: "image/png,image/*;q=0.8,*/*;q=0.1",
    },
    signal: AbortSignal.timeout(8500),
  });
  const finalHost = new URL(response.url).hostname.toLowerCase();
  if (finalHost !== "aemet.es" && !finalHost.endsWith(".aemet.es")) {
    throw new Error("AEMET download redirected to a non-AEMET host");
  }
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error("AEMET HTTP " + response.status);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("AEMET image too large");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > MAX_BYTES ||
      !PNG.every((part, i) => bytes[i] === part)) {
    throw new Error("AEMET did not return a PNG image");
  }
  const dimensions = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dimensions.getUint32(16, false);
  const height = dimensions.getUint32(20, false);
  if (width < 400 || width > 10000 || height < 400 || height > 10000) {
    throw new Error("AEMET PNG size not plausible");
  }
  return bytes;
}

function secretKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default !== "string" || !keys.default) {
    throw new Error("Supabase admin key unavailable");
  }
  return keys.default;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const url = Deno.env.get("SUPABASE_URL");
  if (!url) return Response.json({ error: "Supabase URL not configured" }, { status: 503 });
  const admin = createClient(url, secretKey(), { auth: { persistSession: false } });

  // verify_jwt is disabled for cron; explicit shared-secret verification is mandatory.
  const provided = request.headers.get("x-briefings-cron-token") ?? "";
  if (!provided || provided.length > 200) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: authorized, error: authError } = await admin.rpc(
    "briefings_verify_aemet_runner_token", { candidate: provided }
  );
  if (authError || authorized !== true) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { body = {}; }
  const kind = body.kind;
  if (kind !== "sigwx" && kind !== "wind-temp" && kind !== "all") {
    return Response.json({ error: "Invalid chart kind" }, { status: 400 });
  }
  const probe = body.probe === true;
  const now = new Date();
  const result: Record<string, Result> = {};

  for (const type of (kind === "all" ? ["sigwx", "wind-temp"] : [kind]) as Array<"sigwx" | "wind-temp">) {
    const report: Result = { uploaded: 0, alreadyStored: 0, notPublished: 0, errors: [] };
    result[type] = report;
    const charts = candidates(now, type);
    const source = admin.storage.from(BUCKET);

    let existing = new Set<string>();
    if (!probe) {
      const listing = await source.list(type, { limit: 1000, sortBy: { column: "name", order: "desc" } });
      if (listing.error) {
        return Response.json({ error: "Storage listing failed", kind: type }, { status: 502 });
      }
      existing = new Set((listing.data || []).map((e) => e.name));
    }

    const todo = charts.filter((c) => {
      const present = existing.has(c.path.split("/")[1]);
      if (present) report.alreadyStored++;
      return !present;
    });
    // During a network probe only try a handful of representative recent charts.
    const selected = probe ? todo.slice(0, 3) : todo;

    // Bound concurrent network requests and keep the function below execution limits.
    for (let i = 0; i < selected.length; i += 4) {
      const group = selected.slice(i, i + 4);
      await Promise.all(group.map(async (chart) => {
        try {
          const png = await retrieve(chart);
          if (!png) {
            report.notPublished++;
            return;
          }
          if (!probe) {
            const storage = await source.upload(chart.path, png, {
              upsert: false,
              contentType: "image/png",
              cacheControl: "300",
            });
            if (storage.error) {
              if (storage.error.message.includes("already exists") ||
                  storage.error.message.includes("Duplicate")) {
                report.alreadyStored++;
                return;
              }
              throw new Error("Supabase upload failed: " + storage.error.message);
            }
          }
          report.uploaded++;
        } catch (e) {
          report.errors.push(chart.path + ": " + String(e instanceof Error ? e.message : e).slice(0, 160));
        }
      }));
    }
  }
  const obtained = Object.values(result).reduce((n, r) => n + r.uploaded + r.alreadyStored, 0);
  const errors = Object.values(result).reduce((n, r) => n + r.errors.length, 0);
  const good = obtained > 0 && errors === 0;
  return Response.json({ ok: good, probe, checkedAt: now.toISOString(), result }, {
    status: good ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
});
