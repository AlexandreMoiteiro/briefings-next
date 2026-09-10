import { supabase } from "@/lib/supabase/client";

const IP_HASH_STORAGE_KEY = "briefings_export_ip_hash";
const CLIENT_ID_STORAGE_KEY = "briefings_anonymous_client_id";

type ExportAccessResponse = {
  allowed: boolean;
  ipHash: string | null;
};

export function getAnonymousClientId() {
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
    return { allowed: true, ipHash: null };
  }
}

async function submitUnblockDirect(input: {
  clientId: string;
  ipHash: string;
  pilotName: string;
  message: string;
  pageUrl: string | null;
}) {
  if (!supabase) throw new Error("Messaging service unavailable.");

  const { error } = await supabase.rpc("submit_export_unblock_request", {
    p_client_id: input.clientId,
    p_ip_hash: input.ipHash || null,
    p_pilot_name: input.pilotName,
    p_message: input.message,
    p_page_url: input.pageUrl,
    p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  });

  if (error) throw new Error(error.message || "Could not send the request.");
}

export async function submitExportUnblockRequest(input: {
  pilotName: string;
  message: string;
}) {
  const clientId = getAnonymousClientId();
  const ipHash = getStoredExportIpHash();
  const pilotName = input.pilotName.trim();
  const message = input.message.trim();
  const pageUrl = typeof window !== "undefined" ? window.location.href : null;

  if (!pilotName) throw new Error("Enter your real name.");
  if (message.length < 5) throw new Error("Write a short message to the admin.");

  try {
    const response = await fetch("/api/unblock-request", {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clientId,
        ipHash: ipHash || null,
        pilotName,
        message,
        pageUrl,
      }),
    });

    if (response.ok) return;

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.status < 500) {
      throw new Error(data.error || "Could not send the request.");
    }
  } catch (error) {
    if (error instanceof Error && !/fetch|network|failed/i.test(error.message)) {
      throw error;
    }
  }

  await submitUnblockDirect({ clientId, ipHash, pilotName, message, pageUrl });
}
