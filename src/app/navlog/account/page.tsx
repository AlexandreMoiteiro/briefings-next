"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { NavlogAccountPanel } from "../navlog-account-panel";

export default function NavlogAccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    void client.auth.getUser().then(({ data }) => {
      if (active) { setUser(data.user); setReady(true); }
    });
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setReady(true); }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return (
    <main className="mx-auto max-w-lg px-5 py-12 sm:py-20">
      <Link href="/navlog" className="text-sm font-medium text-zinc-600 hover:text-zinc-950">← Back to NavLog</Link>
      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Briefings · NavLog</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">{user ? "Your account" : "Your NavLog account"}</h1>
        <div className="mt-7">
          <NavlogAccountPanel user={user} ready={ready} onClose={() => router.push("/navlog")} />
        </div>
      </div>
    </main>
  );
}
