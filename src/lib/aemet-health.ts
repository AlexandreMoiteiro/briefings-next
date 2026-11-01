export type ChartFile = { name: string };

type HealthCheck = { product: string; healthy: boolean; detail: string };
export type AemetHealth = { healthy: boolean; checks: HealthCheck[]; problems: string[] };

const SIGWX = /^(\d{4}-\d{2}-\d{2})_(00|06|12|18)\.png$/;
const WIND = /^(\d{8})_HMAR(00|12)_H(003|006|009|012|015|018|021|024|027|030)_FL(020|050|100|150)\.png$/;
const LEVELS = ["020", "050", "100", "150"] as const;
const HOUR = 3600000;

function sigwxValidity(filename: string): number | null {
  const match = SIGWX.exec(filename);
  if (!match) return null;
  const value = Date.parse(`${match[1]}T${match[2]}:00:00Z`);
  return Number.isFinite(value) ? value : null;
}

function windCycle(filename: string): { time: number; fl: string } | null {
  const match = WIND.exec(filename);
  if (!match) return null;
  const day = match[1];
  const time = Date.parse(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T${match[2]}:00:00Z`);
  return Number.isFinite(time) ? { time, fl: match[4] } : null;
}

export function evaluateAemetHealth(
  sigwx: ChartFile[],
  wind: ChartFile[],
  now = new Date(),
): AemetHealth {
  const current = now.getTime();
  const validity = sigwx.map((file) => sigwxValidity(file.name))
    .filter((ms): ms is number => ms !== null && ms <= current + 24 * HOUR);
  const latestSigwx = validity.length ? Math.max(...validity) : null;
  const checks: HealthCheck[] = [];

  if (latestSigwx === null || latestSigwx < current - 9 * HOUR) {
    checks.push({
      product: "SIGWX",
      healthy: false,
      detail: latestSigwx === null
        ? "Nenhuma carta SIGWX encontrada."
        : `A última SIGWX é válida para ${new Date(latestSigwx).toISOString()} (mais de 9 h de atraso).`,
    });
  } else {
    checks.push({ product: "SIGWX", healthy: true, detail: "SIGWX atualizada." });
  }

  const latestWind = new Map<string, number>();
  for (const file of wind) {
    const parsed = windCycle(file.name);
    if (!parsed || parsed.time > current + 6 * HOUR) continue;
    latestWind.set(parsed.fl, Math.max(latestWind.get(parsed.fl) ?? 0, parsed.time));
  }
  for (const fl of LEVELS) {
    const issuedAt = latestWind.get(fl);
    if (issuedAt === undefined || issuedAt < current - 18 * HOUR) {
      checks.push({
        product: `Wind/Temp FL${fl}`,
        healthy: false,
        detail: issuedAt === undefined
          ? `Não existem cartas Wind/Temp FL${fl}.`
          : `Wind/Temp FL${fl}: última execução do modelo em ${new Date(issuedAt).toISOString()} (mais de 18 h).`,
      });
    } else {
      checks.push({ product: `Wind/Temp FL${fl}`, healthy: true, detail: `FL${fl} atualizado.` });
    }
  }

  return {
    healthy: checks.every((check) => check.healthy),
    checks,
    problems: checks.filter((check) => !check.healthy).map((check) => check.detail),
  };
}
