import { createClient } from "npm:@supabase/supabase-js@2";

// O prazo de validade vem do nome da carta, não da data em que foi carregada.
// A margem de 24 h coincide com o intervalo histórico mostrado no website.
const BUCKET = "aemet-charts";
const GRACE_HOURS = 24;
const PAGE_SIZE = 1000;
const MAX_DELETE_PER_RUN = 500;
const SIGWX = /^(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/;
const WIND = /^(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/;
const LEGACY_WIND = /^(\d{4}-\d{2}-\d{2})_(00|03|06|09|12|15|18|21)_FL(020|050|100|150)\.png$/;

const respond = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function adminKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  if (typeof keys.default !== "string" || !keys.default) throw new Error("Admin key unavailable");
  return keys.default;
}

export function validAtMs(folder: "sigwx" | "wind-temp", filename: string): number | null {
  if (folder === "sigwx") {
    const match = SIGWX.exec(filename);
    if (!match) return null;
    const valid = Date.parse(`${match[1]}T${match[2]}:00:00Z`);
    return Number.isFinite(valid) ? valid : null;
  }
  const match = WIND.exec(filename);
  if (match) {
    const ymd = match[1];
    const issued = Date.parse(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${match[2]}:00:00Z`);
    return Number.isFinite(issued) ? issued + Number(match[3]) * 3600000 : null;
  }
  // Apenas o formato antigo conhecido, já não utilizado pelo website.
  const old = LEGACY_WIND.exec(filename);
  if (!old) return null;
  const valid = Date.parse(`${old[1]}T${old[2]}:00:00Z`);
  return Number.isFinite(valid) ? valid : null;
}

type Report = {
  dryRun: boolean;
  cutoff: string;
  scanned: number;
  eligible: number;
  deleted: number;
  protected: number;
  unknown: number;
  truncated: boolean;
  errors: string[];
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const token = request.headers.get("x-briefings-cron-token") || "";
  if (token.length < 20 || token.length > 200) return respond({ error: "Unauthorized" }, 401);

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), {
      auth: { persistSession: false },
    });
    // Reutiliza o segredo e a verificação já instalados para o antigo cron AEMET.
    const { data: authorized, error: authError } = await supabase.rpc(
      "briefings_verify_aemet_runner_token", { candidate: token },
    );
    if (authError || authorized !== true) return respond({ error: "Unauthorized" }, 401);

    const body: unknown = await request.json().catch(() => ({}));
    const dryRun = typeof body === "object" && body !== null &&
      "dry_run" in body && body.dry_run === true;
    const cutoffMs = Date.now() - GRACE_HOURS * 3600000;
    const report: Report = {
      dryRun,
      cutoff: new Date(cutoffMs).toISOString(),
      scanned: 0,
      eligible: 0,
      deleted: 0,
      protected: 0,
      unknown: 0,
      truncated: false,
      errors: [],
    };
    const source = supabase.storage.from(BUCKET);
    const expired: string[] = [];

    for (const folder of ["sigwx", "wind-temp"] as const) {
      for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
        const { data, error } = await source.list(folder, {
          limit: PAGE_SIZE,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) {
          report.errors.push(`Could not list ${folder}: ${error.message}`);
          break;
        }
        for (const item of data || []) {
          if (!item.id) continue; // Não remover subpastas ou entradas virtuais.
          report.scanned++;
          const validity = validAtMs(folder, item.name);
          if (validity === null) {
            report.unknown++;
          } else if (validity < cutoffMs) {
            report.eligible++;
            if (expired.length < MAX_DELETE_PER_RUN) {
              expired.push(`${folder}/${item.name}`);
            } else {
              report.truncated = true;
            }
          } else {
            report.protected++;
          }
        }
        if (!data || data.length < PAGE_SIZE) break;
      }
    }

    // Nunca apagar objetos se não se conseguiu completar o inventário.
    if (report.errors.length) return respond({ ok: false, ...report }, 502);
    if (!dryRun) {
      for (let start = 0; start < expired.length; start += 100) {
        const batch = expired.slice(start, start + 100);
        const { error } = await source.remove(batch);
        if (error) {
          report.errors.push(`Could not remove batch: ${error.message}`);
          break;
        }
        report.deleted += batch.length;
      }
    }
    console.log(JSON.stringify({ action: "aemet-storage-cleanup", ...report }));
    return respond({ ok: report.errors.length === 0, ...report }, report.errors.length ? 502 : 200);
  } catch (error) {
    console.error("AEMET storage cleanup failed", String(error));
    return respond({ error: "Cleanup failed" }, 500);
  }
});
