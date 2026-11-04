"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
};

export function PinCodeInput({ value, onChange, disabled = false, label = "4-digit PIN" }: Props) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const focusDigit = (index: number) => inputs.current[Math.max(0, Math.min(3, index))]?.focus();

  function insert(index: number, raw: string) {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return;
    if (digits.length > 1) {
      onChange(digits.slice(0, 4));
      requestAnimationFrame(() => focusDigit(Math.min(3, digits.length - 1)));
      return;
    }
    const position = Math.min(index, value.length);
    onChange((value.slice(0, position) + digits + value.slice(position + 1)).slice(0, 4));
    if (position < 3) requestAnimationFrame(() => focusDigit(position + 1));
  }

  function handleKey(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const position = Math.min(index, value.length - 1);
      if (position >= 0) {
        onChange(value.slice(0, position) + value.slice(position + 1));
        requestAnimationFrame(() => focusDigit(position));
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault(); focusDigit(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault(); focusDigit(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (digits) {
      onChange(digits);
      requestAnimationFrame(() => focusDigit(Math.min(3, digits.length - 1)));
    }
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-2.5 text-sm font-medium text-zinc-800">{label}</legend>
      <div className="flex gap-2.5 sm:gap-3" role="group" aria-label={label}>
        {Array.from({ length: 4 }, (_, index) => (
          <input
            key={index}
            ref={(node) => { inputs.current[index] = node; }}
            aria-label={`PIN digit ${index + 1} of 4`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            pattern="[0-9]"
            required
            value={value[index] ?? ""}
            onFocus={() => { if (index > value.length) focusDigit(value.length); }}
            onChange={(event) => insert(index, event.target.value)}
            onKeyDown={(event) => handleKey(index, event)}
            onPaste={handlePaste}
            className="h-14 w-14 min-w-0 rounded-xl border border-zinc-300 bg-white text-center text-xl font-semibold text-zinc-950 shadow-sm outline-none transition-colors focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100 sm:h-16 sm:w-16"
          />
        ))}
      </div>
    </fieldset>
  );
}
