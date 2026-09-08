const IP_HASH_STORAGE_KEY = "briefings_export_ip_hash";

type ExportAccessResponse = {
  allowed: boolean;
  ipHash: string | null;
};

export function getStoredExportIpHash() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(IP_HASH_STORAGE_KEY)?.trim() ?? "";
}

export async function checkExportAccess(): Promise<ExportAccessResponse> {
  try {
    const response = await fetch("/api/export-access", {
      method: "POST",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) return { allowed: true, ipHash: null };

    const data = (await response.json()) as Partial<ExportAccessResponse>;
    const ipHash = typeof data.ipHash === "string" ? data.ipHash : null;

    if (ipHash) window.localStorage.setItem(IP_HASH_STORAGE_KEY, ipHash);

    return {
      allowed: data.allowed !== false,
      ipHash,
    };
  } catch {
    // Export remains available if the abuse-check service itself is unavailable.
    return { allowed: true, ipHash: null };
  }
}
