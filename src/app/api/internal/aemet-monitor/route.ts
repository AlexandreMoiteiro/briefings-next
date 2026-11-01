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
  updated_at: string;
};

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
      supabase.from("aemet_alert_state").select("status,last_notified_at,updated_at")
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

    const recovering = health.healthy && previous?.status === "alert";
    const missed = !health.healthy;
    const lastAlertAge = previous?.last_notified_at
      ? now.getTime() - Date.parse(previous.last_notified_at) : Number.POSITIVE_INFINITY;
    const alertDue = missed && (previous?.status !== "alert" || lastAlertAge >= REMINDER_AFTER_MS);

    if (alertDue || recovering) {
      const notification = await sendAdminNotification({
        subject: recovering ? "[Briefings] AEMET — recolha recuperada" : "[Briefings] ALERTA — cartas AEMET desatualizadas",
        heading: recovering ? "A recolha das cartas AEMET voltou ao normal" : "Problemas na atualização das cartas AEMET",
        lines: recovering
          ? ["As cartas SIGWX e Wind/Temp voltaram a apresentar atualizações recentes.", `Verificado em: ${now.toISOString()}`]
          : ["O monitor encontrou cartas em falta ou demasiado antigas:", ...health.problems, `Verificado em: ${now.toISOString()}`, "A carta pode ainda não ter sido publicada pela AEMET. Confirma o estado do Collector no Cloudflare."],
      });
      if (!notification.sent) {
        console.error("AEMET monitor notification failed", notification.reason);
        return response({ error: "Monitor email not sent", reason: notification.reason }, 503);
      }
    }

    // Se há um incidente em aberto, conservar o estado até à recuperação.
    // Uma única mensagem por incidente, com lembrete no máximo diário.
    if (!previous || alertDue || recovering) {
      const nextStatus = health.healthy ? "healthy" : "alert";
      const next = await supabase.from("aemet_alert_state").upsert({
        monitor_key: MONITOR_KEY,
        status: nextStatus,
        last_notified_at: alertDue || recovering ? now.toISOString() : previous?.last_notified_at ?? null,
        detail: health.problems.join("\n").slice(0, 2000),
        updated_at: now.toISOString(),
      });
      if (next.error) {
        console.error("AEMET monitor could not persist status", next.error.message);
        return response({ error: "Could not update monitor status" }, 502);
      }
    }

    return response({ ok: true, healthy: health.healthy, notificationSent: alertDue || recovering, problems: health.problems });
  } catch (error) {
    console.error("AEMET monitor failed", error);
    return response({ error: "AEMET monitor failed" }, 500);
  }
}
