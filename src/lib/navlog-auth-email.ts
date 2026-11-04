/** Transactional NavLog emails are sent server-side, independently of Supabase SMTP. */
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "Briefings", email: "noreply.briefings@gmail.com" };

export type NavlogEmailKind = "confirm" | "recovery";

export function ensureNavlogEmailConfigured() {
  if (!process.env.BREVO_API_KEY?.trim()) {
    throw new Error("Brevo sending is not configured for this deployment.");
  }
}

export function navlogEmailRedirect(path: "/navlog" | "/navlog/reset-password") {
  // Never trust the incoming Host header for token-bearing email links.
  // Vercel provides a fixed hostname for each Preview deployment.
  const host = process.env.VERCEL_URL;
  const configured = process.env.NAVLOG_PUBLIC_URL;
  const origin = configured || (host ? `https://${host}` : null);
  if (!origin) throw new Error("The NavLog email redirect URL is not configured.");
  const url = new URL(path, origin);
  if (url.protocol !== "https:") throw new Error("NavLog email redirects must use HTTPS.");
  return url.toString();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

export async function sendNavlogAuthEmail(email: string, actionLink: string, kind: NavlogEmailKind) {
  ensureNavlogEmailConfigured();
  const apiKey = process.env.BREVO_API_KEY!.trim();
  const link = new URL(actionLink);
  if (link.protocol !== "https:" || link.hostname !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname) {
    throw new Error("Invalid authentication link destination.");
  }

  const confirmation = kind === "confirm";
  const subject = confirmation ? "Confirm your Briefings NavLog account" : "Reset your Briefings NavLog PIN";
  const heading = confirmation ? "Confirm your email" : "Reset your PIN";
  const explanation = confirmation
    ? "Confirm this email address to start saving your routes in Briefings NavLog."
    : "Use the secure link below to choose a new four-digit PIN for your Briefings NavLog account.";
  const button = confirmation ? "Confirm email" : "Reset PIN";
  const safeLink = escapeHtml(link.toString());

  const response = await fetch(BREVO_ENDPOINT, {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email }],
      subject,
      htmlContent: `<!doctype html><html><body style="background:#f5f5f5;padding:32px 12px;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:500px;margin:auto;background:white;border:1px solid #e4e4e7;border-radius:14px;padding:30px"><p style="font-size:12px;letter-spacing:1px;color:#71717a">BRIEFINGS · NAVLOG</p><h1 style="font-size:24px;margin:22px 0 12px">${heading}</h1><p style="line-height:1.6">${explanation}</p><p style="margin:30px 0"><a href="${safeLink}" style="display:inline-block;background:#18181b;color:white;border-radius:8px;padding:13px 22px;text-decoration:none;font-weight:bold">${button}</a></p><p style="font-size:13px;color:#71717a;line-height:1.5">If you didn't request this, you can safely ignore this email.</p></div></body></html>`,
      textContent: `${heading}\n\n${explanation}\n\n${link.toString()}\n\nIf you didn't request this, you can ignore this email.`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    // No email addresses, tokens, API keys, or response bodies in logs.
    console.error("Brevo NavLog email request failed", response.status);
    throw new Error("Could not send the authentication email.");
  }
}
