import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { evaluateAemetHealth } from "@/lib/aemet-health";
import { sendAdminNotification } from "@/lib/admin-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "aemet-charts";
const MONITOR_KEY = "aemet-charts";
const REMINDER_AFTER_MS = 24 * 3600000;

type LastState = {
  status: "healthy" | "alert";
  last_notified_at: string | null;
  detail: string | null;
  updated_at: string;
};

// Existing storage only permits "healthy" / "alert". Preserve that schema,
// and keep the detailed severity in the detail field for email transitions.
// Legacy alerts based solely on a late model run map to "warning".
function previousSeverity(state: LastState | null): "healthy" | "warning" | "critical" {
  if (!state || state.status === "healthy") return "healthy";
  if (state.detail?.startsWith("severity=warning\n")) return "warning";
  if (state.detail?.startsWith("severity=critical\n")) return "critical";
  if (state.detail?.includes("última execução do modelo") && !state.detail.includes("SIGWX")) return "warning";
  return "critical";
}

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(request: Request) {
  const expected = process.env.AEMET_MONITOR_TOKEN?.trim() || "";
  const supplied = /^Bearer (\S+)$/.exec(request.headers.get("authorization") || "")?.[1] || "";
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return response({ error: "Unauthorized" }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.AEMET_SUPABASE_SECRET;
  if (!url || !secret) return response({ error: "Supabase monitor is not configured" }, 503);

  let dryRun = false;
  try {
    const body = await request.json() as { dry_run?: unknown };
    dryRun = body?.dry_run === true;
  } catch { /* A chamada do cron também pode enviar um corpo vazio. */ }

  try {
    const supabase = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const [sigwx, wind, savedState] = await Promise.all([
      supabase.storage.from(BUCKET).list("sigwx", { limit: 1000 }),
      supabase.storage.from(BUCKET).list("wind-temp", { limit: 1000 }),
      supabase.from("aemet_alert_state").select("status,last_notified_at,detail,updated_at")
        .eq("monitor_key", MONITOR_KEY).maybeSingle(),
    ]);
    if (sigwx.error || wind.error || savedState.error) {
      console.error("AEMET monitor query failed", {
        sigwx: sigwx.error?.message,
        wind: wind.error?.message,
        state: savedState.error?.message,
      });
      return response({ error: "Could not inspect AEMET charts" }, 502);
    }

    const now = new Date();
    const health = evaluateAemetHealth(sigwx.data || [], wind.data || [], now);
    const previous = savedState.data as LastState | null;
    if (dryRun) {
      return response({ dryRun: true, ...health, previousStatus: previous?.status || "none" });
    }

    const oldSeverity = previousSeverity(previous);
    const changed = oldSeverity !== health.severity;
    const lastAlertAge = previous?.last_notified_at
      ? now.getTime() - Date.parse(previous.last_notified_at) : Number.POSITIVE_INFINITY;
    const notificationDue = health.severity === "healthy"
      ? changed
      : changed || lastAlertAge >= REMINDER_AFTER_MS;

    if (notificationDue) {
      const recovered = health.severity === "healthy";
      const critical = health.severity === "critical";
      const downgraded = oldSeverity === "critical" && health.severity === "warning";
      const notification = await sendAdminNotification({
        subject: recovered
          ? "[Briefings] AEMET — cartas normalizadas"
          : critical
            ? "[Briefings] ALERTA — cartas AEMET sem cobertura"
            : downgraded
              ? "[Briefings] AEMET — cobertura recuperada, atualização pendente"
              : "[Briefings] AEMET — atualização Wind/Temp pendente",
        heading: recovered
          ? "A recolha das cartas AEMET voltou ao normal"
          : critical
            ? "Faltam cartas meteorológicas para o período atual ou próximo"
            : "Execução mais recente ainda não disponível",
        lines: recovered
          ? ["As cartas SIGWX e Wind/Temp voltaram a apresentar atualizações e cobertura adequadas.", `Verificado em: ${now.toISOString()}`]
          : [
              critical
                ? "Existem produtos sem cobertura suficiente para o período atual ou as próximas 3 horas. Consultar as fontes oficiais antes da utilização."
                : "A execução mais recente está atrasada, mas as cartas armazenadas ainda cobrem o período atual e as próximas horas.",
              ...health.problems,
              `Verificado em: ${now.toISOString()}`,
              "A carta pode ainda não ter sido publicada pela AEMET. Confirma o estado do Collector no Cloudflare.",
            ],
      });
      if (!notification.sent) {
        console.error("AEMET monitor notification failed", notification.reason);
        return response({ error: "Monitor email not sent", reason: notification.reason }, 503);
      }
    }

    // Retain existing database constraints, encoding severity in the detail.
    // Never report a warning as full recovery; only "healthy" means normal.
    if (!previous || changed || notificationDue) {
      const next = await supabase.from("aemet_alert_state").upsert({
        monitor_key: MONITOR_KEY,
        status: health.severity === "healthy" ? "healthy" : "alert",
        last_notified_at: notificationDue ? now.toISOString() : previous?.last_notified_at ?? null,
        detail: (`severity=${health.severity}\n${health.problems.join("\n")}`).slice(0, 2000),
        updated_at: now.toISOString(),
      });
      if (next.error) {
        console.error("AEMET monitor could not persist status", next.error.message);
        return response({ error: "Could not update monitor status" }, 502);
      }
    }

    return response({
      ok: true, healthy: health.healthy, severity: health.severity,
      notificationSent: notificationDue, problems: health.problems,
    });
  } catch (error) {
    console.error("AEMET monitor failed", error);
    return response({ error: "AEMET monitor failed" }, 500);
  }
}
