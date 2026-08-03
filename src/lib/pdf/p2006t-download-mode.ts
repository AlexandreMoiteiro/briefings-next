export type P2006TDownloadMode = "form" | "kneeboard" | "tables";

declare global {
  interface Window {
    __briefingsP2006TDownloadMode?: P2006TDownloadMode;
  }
}

export function setP2006TDownloadMode(mode: P2006TDownloadMode) {
  if (typeof window !== "undefined") {
    window.__briefingsP2006TDownloadMode = mode;
  }
}

export function getP2006TDownloadMode(): P2006TDownloadMode | null {
  return typeof window === "undefined"
    ? null
    : window.__briefingsP2006TDownloadMode ?? null;
}

export function clearP2006TDownloadMode() {
  if (typeof window !== "undefined") {
    delete window.__briefingsP2006TDownloadMode;
  }
}
