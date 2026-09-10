import { NextResponse } from "next/server";
import { sendAdminNotification } from "@/lib/admin-notifications";
import { createPublicServerSupabase } from "@/lib/supabase/server-client";

type UnblockBody = {
  clientId?: string;
  ipHash?: string | null;
  pilotName?: string;
  message?: string;
  pageUrl?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UnblockBody;
    const clientId = String(body.clientId ?? "").trim();
    const ipHash = body.ipHash ? String(body.ipHash).trim() : null;
    const pilotName = String(body.pilotName ?? "").trim();
    const message = String(body.message ?? "").trim();
    const pageUrl = body.pageUrl ? String(body.pageUrl).trim() : null;

    if (!clientId) {
      return NextResponse.json({ error: "Missing client identifier." }, { status: 400 });
    }
    if (!pilotName) {
      return NextResponse.json({ error: "Enter your real name." }, { status: 400 });
    }
    if (message.length < 5) {
      return NextResponse.json({ error: "Write a short message to the admin." }, { status: 400 });
    }

    const supabase = createPublicServerSupabase();
    const { data, error } = await supabase.rpc("submit_export_unblock_request", {
      p_client_id: clientId,
      p_ip_hash: ipHash,
      p_pilot_name: pilotName,
      p_message: message,
      p_page_url: pageUrl,
      p_user_agent: request.headers.get("user-agent"),
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Could not send the request." },
        { status: 400 }
      );
    }

    const notification = await sendAdminNotification({
      subject: `[Briefings] Unblock request from ${pilotName}`,
      heading: `New export unblock request from ${pilotName}`,
      lines: [
        `Name: ${pilotName}`,
        `Message: ${message}`,
        pageUrl ? `Page: ${pageUrl}` : "Page: not provided",
        `Device: ${clientId.slice(0, 16)}…`,
        ipHash ? `Network fingerprint: ${ipHash.slice(0, 16)}…` : "Network fingerprint: not available",
      ],
    });

    return NextResponse.json({
      ok: true,
      id: data,
      notificationSent: notification.sent,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Could not send the request." }, { status: 500 });
  }
}
