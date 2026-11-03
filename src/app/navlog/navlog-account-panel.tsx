"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type AccountMode = "login" | "signup" | "reset";

export function NavlogAccountPanel({
  user,
  ready,
  onClose,
}: {
  user: User | null;
  ready: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<AccountMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function emailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/navlog/reset-password`,
        });
        if (error) throw error;
        setMessage("If this email has an account, a password reset link will be sent.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/navlog` },
        });
        if (error) throw error;
        setPassword("");
        setMessage(data.session
          ? "Your account is ready."
          : "Check your email to confirm the account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(), password,
        });
        if (error) throw error;
        setPassword("");
        onClose();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-in failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
    else onClose();
    setBusy(false);
  }

  if (!ready) {
    return <p className="py-5 text-sm text-zinc-500">Checking your session…</p>;
  }

  if (user) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Signed in as</p>
        <p className="break-all text-sm font-semibold text-zinc-950">{user.email ?? "NavLog user"}</p>
        <p className="text-sm leading-6 text-zinc-500">Your saved routes are private and available whenever you sign in.</p>
        <button type="button" disabled={busy} onClick={() => void signOut()} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 disabled:opacity-40">
          Sign out
        </button>
        {message ? <p role="status" className="text-xs text-red-700">{message}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 text-sm leading-6 text-zinc-600">Save your NavLog routes privately and open them on any device. Public routes remain available without an account.</p>
      <div className="border-b border-zinc-200">
        <div className="flex gap-6 text-sm">
          <button type="button" onClick={() => { setMode("login"); setMessage(""); }} aria-pressed={mode === "login"} className={`pb-2 ${mode === "login" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Sign in</button>
          <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} aria-pressed={mode === "signup"} className={`pb-2 ${mode === "signup" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Create account</button>
        </div>
      </div>
        <form onSubmit={(event) => void emailSubmit(event)} className="mt-5 space-y-4">
          <label className="block text-sm text-zinc-700">Email address
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
          </label>
          {mode !== "reset" ? (
            <label className="block text-sm text-zinc-700">Password {mode === "signup" ? "(at least 8 characters)" : ""}
              <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
            </label>
          ) : null}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-zinc-950 px-3 py-3 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>
        {message ? <p role="status" className="mt-4 text-sm leading-6 text-zinc-700">{message}</p> : null}
        <button type="button" onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setMessage(""); }} className="mt-3 text-xs text-zinc-600 underline underline-offset-2">
          {mode === "reset" ? "Back to sign in" : "Forgot password?"}
        </button>
    </div>
  );
}
