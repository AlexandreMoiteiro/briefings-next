export function formatOperationalMinutes(minutes: number) {
  const totalMinutes = Math.max(0, Math.round(Number(minutes) || 0));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  return remainingMinutes > 0
    ? `${hours} h ${remainingMinutes} min`
    : `${hours} h`;
}

export function formatOperationalSeconds(seconds: number) {
  return formatOperationalMinutes((Number(seconds) || 0) / 60);
}

export function formatNavlogDuration(seconds: number) {
  const roundedSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const totalMinutes = Math.round(roundedSeconds / 60);

  if (totalMinutes >= 60) {
    return formatOperationalMinutes(totalMinutes);
  }

  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}
