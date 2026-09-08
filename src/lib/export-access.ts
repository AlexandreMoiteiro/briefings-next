const IP_HASH_STORAGE_KEY = "briefings_export_ip_hash";
const CLIENT_ID_STORAGE_KEY = "briefings_anonymous_client_id";

type ExportAccessResponse = {
  allowed: boolean;
  ipHash: string | null;
};

function getAnonymousClientId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
  return id;
}

export function getStoredExportIpHash() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(IP_HASH_STORAGE_KEY)?.trim() ?? "";
}

export async function checkExportAccess(): Promise<ExportAccessResponse> {
  try {
    const response = await fetch("/api/export-access", {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ clientId: getAnonymousClientId() }),
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
