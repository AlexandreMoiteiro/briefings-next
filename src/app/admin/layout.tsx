import Link from "next/link";
import type { ReactNode } from "react";

const adminLinks = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/ip-bans", label: "Export access" },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
              Administration
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              Usage, messages and export access controls.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Admin navigation">
            {adminLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      {children}
    </div>
  );
}
