import { NextResponse } from "next/server";
import { sendAdminNotification } from "@/lib/admin-notifications";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

type FeedbackBody = {
  clientId?: string;
  name?: string;
  email?: string;
  kind?: string;
  subject?: string;
  message?: string;
  pageUrl?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const clientId = String(body.clientId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const kind = String(body.kind ?? "suggestion").trim().toLowerCase();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();
    const pageUrl = body.pageUrl ? String(body.pageUrl).trim() : null;

    if (!clientId) {
      return NextResponse.json({ error: "Missing client identifier." }, { status: 400 });
    }
    if (name.length < 2) {
      return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    }
    if (message.length < 10) {
      return NextResponse.json({ error: "Message is too short." }, { status: 400 });
    }

    const supabase = createPublicServerSupabase();
    const { data, error } = await supabase.rpc("submit_app_feedback_message", {
      p_client_id: clientId,
      p_name: name,
      p_email: email || null,
      p_kind: kind,
      p_subject: subject,
      p_message: message,
      p_page_url: pageUrl,
      p_user_agent: request.headers.get("user-agent"),
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not save the message." },
        { status: 400 }
      );
    }

    const category =
      kind === "question"
        ? "Question"
        : kind === "issue"
          ? "Problem"
          : kind === "suggestion"
            ? "Suggestion"
            : "Message";

    const notification = await sendAdminNotification({
      subject: `[Briefings] ${category}${subject ? `: ${subject}` : ""}`,
      heading: `New ${category.toLowerCase()} from ${name}`,
      replyTo: email || null,
      lines: [
        `Name: ${name}`,
        email ? `Email: ${email}` : "Email: not provided",
        subject ? `Subject: ${subject}` : "Subject: not provided",
        `Message: ${message}`,
        pageUrl ? `Related page: ${pageUrl}` : "Related page: not provided",
      ],
    });

    return NextResponse.json({
      ok: true,
      id: data,
      notificationSent: notification.sent,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not send the message." }, { status: 500 });
  }
}
