"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type VerificationStatus = "checking" | "confirmed" | "failed";

export default function NavlogConfirmPage() {
  const processed = useRef(false);
  const [status, setStatus] = useState<VerificationStatus>("checking");

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    window.history.replaceState(window.history.state, "", "/navlog/confirm");
    if (!supabase || !tokenHash || !/^[A-Za-z0-9_-]{20,512}$/.test(tokenHash)) {
      void Promise.resolve().then(() => setStatus("failed"));
      return;
    }

    // A single-use Supabase OTP confirms the address and starts the session.
    void supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
      .then(({ error, data }) => setStatus(!error && data.session && data.user ? "confirmed" : "failed"))
      .catch(() => setStatus("failed"));
  }, []);

  return (
    <main className="mx-auto max-w-lg px-5 py-14 sm:py-24">
      <div className="rounded-2xl border border-zinc-200 bg-white p-7 text-center shadow-sm sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Briefings · NavLog</p>
        <div className={`mx-auto mt-7 flex size-16 items-center justify-center rounded-full text-3xl ${status === "confirmed" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`} aria-hidden="true">
          {status === "checking" ? "…" : status === "confirmed" ? "✓" : "!"}
        </div>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">
          {status === "checking" ? "Confirming your email" : status === "confirmed" ? "Email confirmed" : "This link could not be verified"}
        </h1>
        <p role="status" className="mt-3 text-sm leading-6 text-zinc-600">
          {status === "checking"
            ? "Just a moment while we verify your account."
            : status === "confirmed"
              ? "Your NavLog account is ready. You can now save routes privately and access them whenever you return."
              : "The confirmation link may have expired or already been used. Open NavLog and request a new confirmation email if needed."}
        </p>
        {status !== "checking" ? <Link href="/navlog" className="mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white hover:bg-zinc-800">{status === "confirmed" ? "Open NavLog" : "Return to NavLog"} →</Link> : null}
      </div>
    </main>
  );
}
