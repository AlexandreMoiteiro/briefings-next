"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,24}$/;

export function NavlogAccountPanel({
  user,
  ready,
  onClose,
}: {
  user: User | null;
  ready: boolean;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<{ userId: string; username: string | null } | null>(null);
  const [username, setUsername] = useState("");
  const [editing, setEditing] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (!supabase || !userId) return;
    const client = supabase;
    let active = true;
    void client.from("navlog_user_profiles")
      .select("username")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMessage("Your profile could not be loaded. Please try again.");
          return;
        }
        const savedName = data?.username ?? null;
        setProfile({ userId, username: savedName });
        setUsername(savedName ?? "");
      });
    return () => { active = false; };
  }, [userId]);

  async function signInWithGoogle() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/navlog` },
      });
      if (error) throw error;
      // Supabase redirects to Google; the auth session is restored on return.
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google sign-in could not start.");
      setBusy(false);
    }
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user || busy) return;
    const chosen = username.trim();
    if (!USERNAME_PATTERN.test(chosen)) {
      setMessage("Use 3–24 letters, numbers, dots, dashes or underscores.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) throw new Error("Sign in again to save your username.");

      const response = await fetch("/api/navlog/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ username: chosen }),
        cache: "no-store",
      });
      const result = await response.json() as { username?: string; error?: string };
      if (!response.ok || !result.username) {
        throw new Error(result.error ?? "Could not save your username.");
      }
      setProfile({ userId: user.id, username: result.username });
      setUsername(result.username);
      setEditing(false);
      setMessage("Username saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your username.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setMessage(error.message);
      setBusy(false);
    } else {
      setProfile(null);
      setUsername("");
      setEditing(false);
      setBusy(false);
      onClose();
    }
  }

  if (!ready) {
    return <p className="py-5 text-sm text-zinc-500">Checking your session…</p>;
  }

  if (!supabase) {
    return <p role="alert" className="py-5 text-sm text-red-700">Account sign-in is not configured in this preview.</p>;
  }

  if (!user) {
    return (
      <div className="space-y-5">
        <p className="text-sm leading-6 text-zinc-600">
          Sign in securely with your Google account to save private NavLog routes and reopen them on any device.
          The public route library remains available without signing in.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithGoogle()}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-lg font-bold text-blue-600">G</span>
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
        <p className="text-xs leading-5 text-zinc-500">
          No PIN or email verification service is needed. You can choose a FlightLogger-style username after signing in.
        </p>
        {message ? <p role="alert" className="text-sm text-red-700">{message}</p> : null}
      </div>
    );
  }

  const currentProfile = profile?.userId === user.id ? profile : null;
  const showUsernameForm = Boolean(currentProfile && (!currentProfile.username || editing));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-zinc-600">Signed in with Google as</p>
        <p className="mt-1 break-all text-sm font-semibold text-zinc-950">{user.email ?? "Google account"}</p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Your NavLog routes are private to this account.
        </p>
      </div>

      {!currentProfile ? (
        <p className="text-sm text-zinc-500">Loading your NavLog profile…</p>
      ) : showUsernameForm ? (
        <form className="space-y-3" onSubmit={(event) => void saveUsername(event)}>
          <label className="block text-sm font-medium text-zinc-800">
            Username
            <input
              type="text"
              autoComplete="nickname"
              required
              minLength={3}
              maxLength={24}
              pattern="[A-Za-z0-9._-]{3,24}"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="FlightLogger username (recommended)"
              className="mt-1.5 h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950"
            />
          </label>
          <p className="text-xs leading-5 text-zinc-500">
            Recommended: your FlightLogger username. Choose any available username.
          </p>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 rounded-lg bg-zinc-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {busy ? "Saving…" : "Save username"}
            </button>
            {currentProfile.username ? (
              <button type="button" onClick={() => { setEditing(false); setUsername(currentProfile.username ?? ""); }} className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-700">
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3">
          <div>
            <p className="text-xs text-zinc-500">Username</p>
            <p className="text-sm font-semibold text-zinc-900">{currentProfile.username}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-zinc-700 underline underline-offset-2">
            Edit
          </button>
        </div>
      )}

      {message ? <p role="status" className="text-sm text-zinc-700">{message}</p> : null}
      <button type="button" disabled={busy} onClick={() => void signOut()} className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 disabled:opacity-40">
        Sign out
      </button>
    </div>
  );
}
