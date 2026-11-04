"use client";

import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { PinCodeInput } from "./pin-code-input";

type AccountMode = "login" | "signup" | "recover" | "resend" | "pending" | "recover-sent";
type AuthResponse = {
  error?: string;
  session?: { access_token: string; refresh_token: string } | null;
};

const inputStyle = "mt-2 h-12 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm text-zinc-950 outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";
const primaryStyle = "flex h-12 w-full items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45";

export function NavlogAccountPanel({ user, ready, onClose, initialMode = "login" }: {
  user: User | null;
  ready: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup";
}) {
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function navigate(next: AccountMode) {
    setMode(next);
    setPin("");
    setMessage("");
    setErrorMessage("");
  }

  async function requestAuth(payload: Record<string, string>): Promise<AuthResponse> {
    const response = await fetch("/api/navlog/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json() as AuthResponse;
    if (!response.ok) throw new Error(result.error ?? "The request could not be completed.");
    return result;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    try {
      if (mode === "login") {
        const result = await requestAuth({ action: "login", identifier: identifier.trim(), pin });
        if (!result.session) throw new Error("Unable to start your session.");
        const { error } = await supabase.auth.setSession(result.session);
        if (error) throw error;
        setPin("");
        onClose();
      } else if (mode === "signup") {
        await requestAuth({ action: "signup", email: email.trim(), username: username.trim(), pin });
        navigate("pending");
      } else if (mode === "recover") {
        await requestAuth({ action: "reset", email: email.trim() });
        navigate("recover-sent");
      } else if (mode === "resend") {
        await requestAuth({ action: "resend", email: email.trim() });
        setMessage("If an account is awaiting confirmation, we've sent a new link.");
      }
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy || !email.trim()) return;
    setBusy(true);
    setErrorMessage("");
    setMessage("");
    try {
      await requestAuth({ action: "resend", email: email.trim() });
      setMessage("A new confirmation link has been requested. Check your inbox and spam folder.");
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Please try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setErrorMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) setErrorMessage(error.message);
    else onClose();
    setBusy(false);
  }

  if (!ready) {
    return <div role="status" className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-600">Checking your session…</div>;
  }

  if (user) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-900 text-lg font-semibold text-white">{user.email?.charAt(0).toUpperCase() ?? "P"}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Signed in</p>
            <p className="mt-1 truncate text-sm font-semibold text-zinc-950">{user.email ?? "NavLog account"}</p>
          </div>
        </div>
        <p className="text-sm leading-6 text-zinc-600">Your private routes are linked to this account and available whenever you sign in.</p>
        <button type="button" onClick={onClose} className={primaryStyle}>Continue to NavLog</button>
        <button type="button" disabled={busy} onClick={() => void signOut()} className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-45">{busy ? "Signing out…" : "Sign out"}</button>
        {errorMessage ? <p role="alert" className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  if (mode === "pending" || mode === "recover-sent") {
    const pending = mode === "pending";
    return (
      <div className="space-y-5 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700" aria-hidden="true">✉</div>
        <div>
          <h3 className="text-xl font-semibold tracking-tight text-zinc-950">{pending ? "Check your email" : "Reset link requested"}</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{pending ? "We've sent a confirmation link to" : "If there's an account for this address, a PIN reset link will arrive at"}</p>
          <p className="mt-1 break-all text-sm font-semibold text-zinc-950">{email.trim()}</p>
          <p className="mt-3 text-xs leading-5 text-zinc-500">Check your spam folder too. Links expire for security.</p>
        </div>
        {pending ? <button type="button" disabled={busy} onClick={() => void resend()} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-45">{busy ? "Sending…" : "Send confirmation again"}</button> : null}
        <button type="button" onClick={() => navigate("login")} className={primaryStyle}>Back to sign in</button>
        {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
        {errorMessage ? <p role="alert" className="text-sm text-red-700">{errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {mode === "login" || mode === "signup" ? (
        <div className="grid grid-cols-2 rounded-xl bg-zinc-100 p-1" role="tablist" aria-label="Account options">
          {(["login", "signup"] as const).map((option) => (
            <button key={option} type="button" role="tab" aria-selected={mode === option} onClick={() => navigate(option)}
              className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${mode === option ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-900"}`}>
              {option === "login" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => navigate("login")} className="text-sm font-semibold text-zinc-600 hover:text-zinc-950">← Back to sign in</button>
      )}

      <div>
        <h3 className="text-xl font-semibold tracking-tight text-zinc-950">{mode === "login" ? "Welcome back" : mode === "signup" ? "Start saving your routes" : mode === "recover" ? "Reset your PIN" : "Confirm your email"}</h3>
        <p className="mt-1.5 text-sm leading-6 text-zinc-500">
          {mode === "login" ? "Access your personal NavLog routes." : mode === "signup" ? "A simple account for private routes on any device." : mode === "recover" ? "We'll email you a secure link to choose a new PIN." : "We'll send another link if your account is waiting for confirmation."}
        </p>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        {mode === "login" ? (
          <label className="block text-sm font-medium text-zinc-800">Username or email
            <input type="text" autoComplete="username" required maxLength={254} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Your username or email" className={inputStyle} />
          </label>
        ) : (
          <label className="block text-sm font-medium text-zinc-800">Email address
            <input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={inputStyle} />
          </label>
        )}

        {mode === "signup" ? (
          <label className="block text-sm font-medium text-zinc-800">Username
            <input type="text" autoComplete="nickname" required minLength={3} maxLength={24} pattern="[A-Za-z0-9._-]{3,24}" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="e.g. AMOIT" className={inputStyle} />
          </label>
        ) : null}

        {mode === "login" || mode === "signup" ? (
          <PinCodeInput value={pin} onChange={setPin} label={mode === "signup" ? "Choose a 4-digit PIN" : "Your 4-digit PIN"} disabled={busy} />
        ) : null}

        <button type="submit" disabled={busy || ((mode === "login" || mode === "signup") && pin.length !== 4)} className={primaryStyle}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : mode === "recover" ? "Send reset link" : "Resend confirmation"}
        </button>
      </form>

      {errorMessage ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm leading-5 text-red-800">{errorMessage}</p> : null}
      {message ? <p role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm leading-5 text-emerald-800">{message}</p> : null}

      {mode === "login" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-4 text-xs">
          <button type="button" onClick={() => navigate("recover")} className="font-semibold text-zinc-700 hover:underline">Forgot PIN?</button>
          <button type="button" onClick={() => { setEmail(identifier.includes("@") ? identifier : email); navigate("resend"); }} className="font-medium text-zinc-500 hover:underline">No confirmation email?</button>
        </div>
      ) : mode === "signup" ? (
        <p className="text-center text-xs leading-5 text-zinc-500">You&apos;ll confirm your email before your first sign-in.</p>
      ) : null}
    </div>
  );
}
