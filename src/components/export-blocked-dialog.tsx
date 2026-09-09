"use client";

import { useEffect, useState } from "react";
import { submitExportUnblockRequest } from "@/lib/export-access";

type ExportBlockedDialogProps = {
  open: boolean;
  pilotName: string;
  onPilotNameChange: (value: string) => void;
  onClose: () => void;
};

export function ExportBlockedDialog({
  open,
  pilotName,
  onPilotNameChange,
  onClose,
}: ExportBlockedDialogProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setSending(false);
    setSent(false);
    setError("");
  }, [open]);

  if (!open) return null;

  async function sendRequest() {
    setError("");
    setSending(true);

    try {
      await submitExportUnblockRequest({ pilotName, message });
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not send the request."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-blocked-title"
    >
      <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
              PDF export blocked
            </p>
            <h2
              id="export-blocked-title"
              className="mt-1 text-2xl font-semibold tracking-tight text-zinc-950"
            >
              This device has been blocked
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-3 text-sm leading-6 text-zinc-700">
          <p className="font-semibold text-red-800">
            Access was blocked because a false name was used even though the app explicitly asks users to enter their real name.
          </p>
          <p>
            This is a free tool made available openly to everyone. To keep it free, available to all users and protected from abuse, a real user name is required for PDF downloads.
          </p>
          <p>
            If you believe the block was a mistake, or you want to request access again, you can send a message to the admin below.
          </p>
        </div>

        {sent ? (
          <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Your message was sent to the admin. Access will remain blocked until the admin reviews the request and decides whether to unblock this device.
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Real name
              </span>
              <input
                value={pilotName}
                onChange={(event) => onPilotNameChange(event.target.value)}
                autoComplete="name"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-950"
                placeholder="Your real name"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Message to admin
              </span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                maxLength={2000}
                className="w-full resize-y rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-zinc-950"
                placeholder="Explain why you would like this device to be unblocked."
              />
              <span className="block text-right text-[11px] text-zinc-400">
                {message.length}/2000
              </span>
            </label>

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendRequest()}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send request to admin"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
