import { createHash } from "node:crypto";

type AdminNotificationInput = {
  subject: string;
  heading: string;
  lines: string[];
  replyTo?: string | null;
  idempotencyKey?: string;
};

type NotificationResult = {
  sent: boolean;
  reason?: "not-configured" | "failed";
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SENDER = { name: "Briefings", email: "noreply.briefings@gmail.com" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function validEmail(value: string) {
  return value.length <= 254 && EMAIL_PATTERN.test(value);
}

function sender(): { name: string; email: string } {
  const configured = process.env.ADMIN_NOTIFICATION_FROM?.trim();
  if (!configured) return DEFAULT_SENDER;

  const withName = /^(.+?)\s*<([^<>]+)>$/.exec(configured);
  const email = (withName?.[2] ?? configured).trim();
  // The old Resend test sender is not a Brevo-registered address.
  if (!validEmail(email) || email.toLowerCase() === "onboarding@resend.dev") {
    console.warn("Admin email sender is invalid for Brevo; using the configured default sender.");
    return DEFAULT_SENDER;
  }

  return { name: withName?.[1].trim() || "Briefings", email };
}

/**
 * Brevo documents a UUID idempotency key for transactional batch requests.
 * Preserve the existing logical event key as a deterministic UUID. The Brevo
 * deduplication window is limited (30 minutes), so this is best-effort rather
 * than an application-wide exactly-once guarantee.
 */
function deduplicationId(key: string) {
  const hash = createHash("sha256").update(`briefings-admin:${key}`).digest("hex");
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function sendAdminNotification(
  input: AdminNotificationInput
): Promise<NotificationResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const to = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();

  if (!apiKey || !to || !validEmail(to)) {
    return { sent: false, reason: "not-configured" };
  }

  const textContent = [input.heading, "", ...input.lines].join("\n");
  const htmlLines = input.lines
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
    .join("");
  const replyTo = input.replyTo?.trim();
  const idempotencyKey = input.idempotencyKey?.trim();
  const body = {
    sender: sender(),
    to: [{ email: to }],
    subject: input.subject,
    textContent,
    htmlContent: `<!doctype html><html lang="pt"><body><div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b"><h2 style="margin:0 0 18px">${escapeHtml(input.heading)}</h2>${htmlLines}</div></body></html>`,
    ...(replyTo && validEmail(replyTo) ? { replyTo: { email: replyTo } } : {}),
    ...(idempotencyKey ? { headers: { idempotencyKey: deduplicationId(idempotencyKey) } } : {}),
    tags: ["briefings-admin"],
  };

  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      // Brevo can reject a retry with duplicate_parameter after accepting
      // the original request. Do not trigger a second email in that case.
      if (idempotencyKey && (response.status === 400 || response.status === 409)) {
        const payload = await response.json().catch(() => null) as { code?: string } | null;
        if (payload?.code === "duplicate_parameter") return { sent: true };
      }
      // Never log the recipient, email body, credentials or API response body.
      console.error("Brevo admin email notification failed", response.status);
      return { sent: false, reason: "failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("Brevo admin email notification failed", error instanceof Error ? error.name : "Unknown");
    return { sent: false, reason: "failed" };
  }
}
