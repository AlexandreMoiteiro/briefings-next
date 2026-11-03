"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

type AccountMode = "login" | "signup" | "reset";

export function NavlogAccountPanel({
  user,
  ready,
}: {
  user: User | null;
  ready: boolean;
}) {
  const [mode, setMode] = useState<AccountMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
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
        setMessage("If this email has an account, you will receive a password reset link.");
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/navlog` },
        });
        if (error) throw error;
        setPassword("");
        setMessage(data.session
          ? "Account created. Your private route library is ready."
          : "Check your email to confirm the account, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
        setMessage("");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed. Please retry.");
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
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-semibold text-zinc-950">NavLog account</p>
      {!ready ? (
        <p className="mt-2 text-xs text-zinc-500">Checking your session…</p>
      ) : user ? (
        <div className="mt-2">
          <p className="break-all text-xs text-zinc-600">Signed in as {user.email}</p>
          <button type="button" disabled={busy} onClick={() => void signOut()} className="mt-2 text-xs font-medium text-zinc-700 underline underline-offset-2 disabled:opacity-40">
            Sign out
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-xs leading-5 text-zinc-500">Sign in to save routes privately. You can use the public library without an account.</p>
          <div className="mt-3 flex gap-3 border-b border-zinc-200 text-xs">
            <button type="button" onClick={() => { setMode("login"); setMessage(""); }} aria-pressed={mode === "login"} className={`pb-2 ${mode === "login" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} aria-pressed={mode === "signup"} className={`pb-2 ${mode === "signup" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Create account</button>
          </div>
          <form onSubmit={(event) => void submit(event)} className="mt-3 space-y-2">
            <label className="block text-xs text-zinc-600">
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950" />
            </label>
            {mode !== "reset" ? (
              <label className="block text-xs text-zinc-600">
                Password
                <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950" />
              </label>
            ) : null}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-40">
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </button>
          </form>
          <button type="button" onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setMessage(""); }} className="mt-2 text-xs text-zinc-500 underline underline-offset-2">
            {mode === "reset" ? "Back to sign in" : "Forgot password?"}
          </button>
        </>
      )}
      {message ? <p role="status" className="mt-2 text-xs leading-5 text-zinc-700">{message}</p> : null}
    </div>
  );
}
