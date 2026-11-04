export type ChartFile = { name: string };
export type AemetSeverity = "healthy" | "warning" | "critical";

type HealthCheck = {
  product: string;
  healthy: boolean;
  severity: AemetSeverity;
  detail: string;
};
export type AemetHealth = {
  healthy: boolean;
  severity: AemetSeverity;
  checks: HealthCheck[];
  problems: string[];
};

const SIGWX = /^(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/;
const WIND = /^(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/;
const LEVELS = ["020", "050", "100", "150"] as const;
const HOUR = 3600000;
const WIND_RUN_WARNING_AGE = 18 * HOUR;
const WIND_NEAR_TERM_TOLERANCE = 3 * HOUR;
const WIND_OUTLOOK_HORIZON = 3 * HOUR;

function sigwxValidity(filename: string): number | null {
  const match = SIGWX.exec(filename);
  if (!match) return null;
  const value = Date.parse(`${match[1]}T${match[2]}:00:00Z`);
  return Number.isFinite(value) ? value : null;
}

function windForecast(filename: string): { runAt: number; validAt: number; fl: string } | null {
  const match = WIND.exec(filename);
  if (!match) return null;
  const day = match[1];
  const runAt = Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${match[2]}:00:00Z`);
  if (!Number.isFinite(runAt)) return null;
  return { runAt, validAt: runAt + Number(match[3]) * HOUR, fl: match[4] };
}

/**
 * A late 12Z run is informational as long as earlier forecasts still cover
 * the current time and the near-term outlook. A missing usable forecast is
 * critical, regardless of how recently the model was issued.
 */
export function evaluateAemetHealth(
  sigwx: ChartFile[],
  wind: ChartFile[],
  now = new Date(),
): AemetHealth {
  const current = now.getTime();
  const checks: HealthCheck[] = [];
  const validity = sigwx.map((file) => sigwxValidity(file.name))
    .filter((ms): ms is number => ms !== null && ms <= current + 24 * HOUR);
  const latestSigwx = validity.length ? Math.max(...validity) : null;

  if (latestSigwx === null || latestSigwx < current - 9 * HOUR) {
    checks.push({
      product: "SIGWX",
      healthy: false,
      severity: "critical",
      detail: latestSigwx === null
        ? "Nenhuma carta SIGWX encontrada."
        : `A última SIGWX é válida para ${new Date(latestSigwx).toISOString()} (mais de 9 h de atraso).`,
    });
  } else {
    checks.push({ product: "SIGWX", healthy: true, severity: "healthy", detail: "SIGWX atualizada." });
  }

  const forecasts = wind.map((file) => windForecast(file.name))
    .filter((forecast): forecast is NonNullable<typeof forecast> =>
      forecast !== null && forecast.runAt <= current + 6 * HOUR);

  for (const fl of LEVELS) {
    const byLevel = forecasts.filter((forecast) => forecast.fl === fl);
    const latestRun = byLevel.length ? Math.max(...byLevel.map((forecast) => forecast.runAt)) : null;
    const nearTerm = byLevel.some((forecast) =>
      Math.abs(forecast.validAt - current) <= WIND_NEAR_TERM_TOLERANCE);
    const hasOutlook = byLevel.some((forecast) =>
      forecast.validAt >= current + WIND_OUTLOOK_HORIZON);

    if (!nearTerm || !hasOutlook) {
      checks.push({
        product: `Wind/Temp FL${fl}`,
        healthy: false,
        severity: "critical",
        detail: latestRun === null
          ? `Não existem cartas Wind/Temp FL${fl}.`
          : `Wind/Temp FL${fl}: não existem cartas com cobertura adequada para o período atual e as próximas 3 h (última execução ${new Date(latestRun).toISOString()}).`,
      });
    } else if (latestRun !== null && latestRun < current - WIND_RUN_WARNING_AGE) {
      checks.push({
        product: `Wind/Temp FL${fl}`,
        healthy: false,
        severity: "warning",
        detail: `Wind/Temp FL${fl}: última execução ${new Date(latestRun).toISOString()} (mais de 18 h); existem ainda cartas para o período atual e as próximas horas.`,
      });
    } else {
      checks.push({ product: `Wind/Temp FL${fl}`, healthy: true, severity: "healthy", detail: `FL${fl} atualizado e com cobertura.` });
    }
  }

  const severity: AemetSeverity = checks.some((check) => check.severity === "critical")
    ? "critical"
    : checks.some((check) => check.severity === "warning") ? "warning" : "healthy";
  return {
    healthy: severity === "healthy",
    severity,
    checks,
    problems: checks.filter((check) => !check.healthy).map((check) => check.detail),
  };
}
