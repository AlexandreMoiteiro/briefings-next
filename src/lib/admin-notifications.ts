type AdminNotificationInput = {
  subject: string;
  heading: string;
  lines: string[];
  replyTo?: string | null;
};

type NotificationResult = {
  sent: boolean;
  reason?: "not-configured" | "failed";
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendAdminNotification(
  input: AdminNotificationInput
): Promise<NotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.ADMIN_NOTIFICATION_EMAIL?.trim();
  const from =
    process.env.ADMIN_NOTIFICATION_FROM?.trim() ||
    "Briefings <onboarding@resend.dev>";

  if (!apiKey || !to) {
    return { sent: false, reason: "not-configured" };
  }

  const text = [input.heading, "", ...input.lines].join("\n");
  const htmlLines = input.lines
    .map((line) => `<p style="margin:0 0 10px">${escapeHtml(line)}</p>`)
    .join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject,
        text,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#18181b"><h2 style="margin:0 0 18px">${escapeHtml(input.heading)}</h2>${htmlLines}</div>`,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Admin email notification failed", response.status);
      return { sent: false, reason: "failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("Admin email notification failed", error);
    return { sent: false, reason: "failed" };
  }
}
