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
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
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
      } else {
        const response = await fetch("/api/navlog/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mode === "signup"
            ? { action: "signup", email: email.trim(), username: username.trim(), pin }
            : { action: "login", identifier: identifier.trim(), pin }),
        });
        const result = await response.json() as {
          error?: string;
          session?: { access_token: string; refresh_token: string } | null;
          requiresConfirmation?: boolean;
        };
        if (!response.ok) throw new Error(result.error ?? "Sign-in failed.");
        setPin("");
        if (result.session) {
          const { error } = await supabase.auth.setSession(result.session);
          if (error) throw error;
          onClose();
        } else {
          setMessage("Check your email to confirm your account, then sign in using your username and PIN.");
        }
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
          {mode === "login" ? (
            <label className="block text-sm text-zinc-700">Username or email
              <input type="text" autoComplete="username" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Your username or email" className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
            </label>
          ) : (
            <label className="block text-sm text-zinc-700">Email address
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
            </label>
          )}
          {mode === "signup" ? (
            <label className="block text-sm text-zinc-700">Choose your username
              <input type="text" autoComplete="nickname" required minLength={3} maxLength={24} pattern="[A-Za-z0-9._-]{3,24}" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="FlightLogger username (recommended)" className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950" />
              <span className="mt-1.5 block text-xs leading-5 text-zinc-500">Recommended: use your FlightLogger username. You can choose any available username.</span>
            </label>
          ) : null}
          {mode !== "reset" ? (
            <label className="block text-sm text-zinc-700">4-digit PIN
              <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} inputMode="numeric" pattern="[0-9]{4}" minLength={4} maxLength={4} required value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm tracking-widest text-zinc-950" />
              {mode === "signup" ? <span className="mt-1.5 block text-xs leading-5 text-zinc-500">Exactly four numbers. Avoid easy sequences like 1234 or your birthday.</span> : null}
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
