"use client";

import { useEffect, useState } from "react";
import { getAnonymousClientId } from "@/lib/export-access";

const PILOT_STORAGE_KEY = "briefings_performance_pilot_name";

const TYPES = [
  { value: "suggestion", label: "Suggestion", detail: "An idea to improve the app" },
  { value: "question", label: "Question", detail: "Something you want clarified" },
  { value: "issue", label: "Problem", detail: "Something is not working as expected" },
] as const;

type FeedbackType = (typeof TYPES)[number]["value"];

export function FeedbackClient() {
  const [kind, setKind] = useState<FeedbackType>("suggestion");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sourcePage, setSourcePage] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(window.localStorage.getItem(PILOT_STORAGE_KEY) ?? "");

    try {
      const referrer = document.referrer ? new URL(document.referrer) : null;
      if (referrer?.origin === window.location.origin) {
        setSourcePage(`${referrer.pathname}${referrer.search}`);
      }
    } catch {
      setSourcePage("");
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Enter your name.");
      return;
    }
    if (message.trim().length < 10) {
      setError("Write a little more detail so the message can be understood.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: getAnonymousClientId(),
          name: name.trim(),
          email: email.trim(),
          kind,
          subject: subject.trim(),
          message: message.trim(),
          pageUrl: sourcePage || null,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "Could not send the message.");
      }

      window.localStorage.setItem(PILOT_STORAGE_KEY, name.trim());
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Could not send the message."
      );
    } finally {
      setBusy(false);
    }
  }

  function sendAnother() {
    setSent(false);
    setSubject("");
    setMessage("");
    setError("");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-zinc-200 bg-white px-6 py-8 shadow-sm sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
          Feedback
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950 md:text-5xl">
          Suggestions & questions
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-600">
          Found something confusing, have an idea, or need help with a feature? Send a message here.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="h-fit rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-950">
            What happens next
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-zinc-600">
            <p>Your message goes directly to the Admin inbox.</p>
            <p>If you include an email address, it can be used to reply to you.</p>
            <p>For a blocked export device, use the message box shown in the block popup so the request includes the correct device information.</p>
          </div>
        </aside>

        <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
          {sent ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
              <h2 className="text-lg font-semibold">Message sent</h2>
              <p className="mt-2 text-sm leading-6">
                Your message is now in the Admin inbox. Thank you for taking the time to send it.
              </p>
              <button
                type="button"
                onClick={sendAnother}
                className="mt-4 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-zinc-950">Message type</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Message type">
                  {TYPES.map((option) => {
                    const selected = kind === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setKind(option.value)}
                        className={[
                          "rounded-2xl border p-3 text-left transition",
                          selected
                            ? "border-zinc-950 bg-zinc-950 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-400 hover:bg-white",
                        ].join(" ")}
                      >
                        <span className="block text-sm font-semibold">{option.label}</span>
                        <span className={[
                          "mt-1 block text-xs leading-5",
                          selected ? "text-zinc-300" : "text-zinc-500",
                        ].join(" ")}>
                          {option.detail}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">Name *</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    autoComplete="name"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-950"
                    placeholder="Your name"
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-zinc-700">Email <span className="text-zinc-400">(optional)</span></span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-950"
                    placeholder="For a reply"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">Subject <span className="text-zinc-400">(optional)</span></span>
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={160}
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-950"
                  placeholder="Short summary"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-zinc-700">Message *</span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  required
                  rows={8}
                  maxLength={4000}
                  className="w-full resize-y rounded-2xl border border-zinc-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-zinc-950"
                  placeholder="Tell me what you noticed, what you expected, or what you would like to see improved."
                />
                <span className="block text-right text-xs text-zinc-400">
                  {message.length}/4000
                </span>
              </label>

              {sourcePage ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                  Related page: {sourcePage}
                </p>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </div>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-zinc-950 px-5 py-3 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send message"}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
