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

  async function socialSignIn(provider: "google" | "azure") {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/navlog`,
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    if (error) {
      setMessage(`${provider === "azure" ? "Microsoft" : "Google"} sign-in is not available yet. ${error.message}`);
      setBusy(false);
    }
    // A successful OAuth request navigates to the identity provider.
  }

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
      <p className="mb-5 text-sm leading-6 text-zinc-600">Sign in to keep your NavLog routes in your own account. You can still use public routes without signing in.</p>
      <div className="space-y-2">
        <button type="button" disabled={busy} onClick={() => void socialSignIn("google")} className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:opacity-50">
          <span aria-hidden className="flex size-6 items-center justify-center rounded-full border border-zinc-300 text-sm font-bold">G</span>
          Continue with Google
        </button>
        <button type="button" disabled={busy} onClick={() => void socialSignIn("azure")} className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-50 disabled:opacity-50">
          <span aria-hidden className="grid size-5 grid-cols-2 gap-0.5"><span className="bg-zinc-700" /><span className="bg-zinc-700" /><span className="bg-zinc-700" /><span className="bg-zinc-700" /></span>
          Continue with Microsoft
        </button>
      </div>
      {message ? <p role="alert" className="mt-3 text-xs leading-5 text-red-700">{message}</p> : null}
      <details className="mt-6 border-t border-zinc-200 pt-4">
        <summary className="cursor-pointer text-sm font-medium text-zinc-600">Use email and password instead</summary>
        <p className="mt-3 text-xs leading-5 text-zinc-500">New email accounts require a configured mail service. Google and Microsoft do not require a separate mail domain.</p>
        <div className="mt-3 flex gap-4 border-b border-zinc-200 text-xs">
          <button type="button" onClick={() => { setMode("login"); setMessage(""); }} aria-pressed={mode === "login"} className={`pb-2 ${mode === "login" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Sign in</button>
          <button type="button" onClick={() => { setMode("signup"); setMessage(""); }} aria-pressed={mode === "signup"} className={`pb-2 ${mode === "signup" ? "border-b-2 border-zinc-950 font-semibold" : "text-zinc-500"}`}>Create account</button>
        </div>
        <form onSubmit={(event) => void emailSubmit(event)} className="mt-3 space-y-3">
          <label className="block text-xs text-zinc-600">Email
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
          </label>
          {mode !== "reset" ? (
            <label className="block text-xs text-zinc-600">Password
              <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
            </label>
          ) : null}
          <button type="submit" disabled={busy} className="w-full rounded-lg bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </button>
        </form>
        <button type="button" onClick={() => { setMode(mode === "reset" ? "login" : "reset"); setMessage(""); }} className="mt-3 text-xs text-zinc-600 underline underline-offset-2">
          {mode === "reset" ? "Back to sign in" : "Forgot password?"}
        </button>
      </details>
    </div>
  );
}
