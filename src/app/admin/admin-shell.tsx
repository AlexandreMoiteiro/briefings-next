"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

const navSections = [
  { title: "Geral", links: [{ href: "/admin", label: "Visão geral" }, { href: "/admin/analytics", label: "Atividade do website" }] },
  { title: "NavLog", links: [{ href: "/admin/navlog-routes", label: "Biblioteca de rotas" }, { href: "/admin/accounts", label: "Contas de pilotos" }] },
  { title: "Comunicação", links: [{ href: "/admin/messages", label: "Mensagens" }, { href: "/admin/unblock-requests", label: "Pedidos de desbloqueio" }] },
  { title: "Acessos", links: [{ href: "/admin/ip-bans", label: "Bloqueios e IPs" }, { href: "/admin/export-access", label: "Permissões de exportação" }] },
  { title: "Ferramentas", links: [{ href: "/admin/p2006-performance", label: "Performance P2006T" }, { href: "/admin/c152-performance", label: "Performance C152" }, { href: "/admin/performance-graphs", label: "Gráficos de performance" }] },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logOut() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
      router.push("/admin");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-[1850px] bg-[#f6f6f4] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 px-5 py-5 lg:px-6 lg:py-7">
          <Link href="/admin" className="block leading-none">
            <span className="block text-lg font-bold tracking-tight text-zinc-950">Briefings</span>
            <span className="mt-1.5 block text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Admin console</span>
          </Link>
          <span className="rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-600">Private</span>
        </div>

        <div className="border-t border-zinc-100 px-5 py-3 lg:hidden">
          <label className="flex items-center gap-3 text-xs font-semibold text-zinc-600">Secção
            <select aria-label="Escolher secção do Admin" value={pathname} onChange={(event) => router.push(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-900">
              {navSections.map((section) => (
                <optgroup key={section.title} label={section.title}>
                  {section.links.map((link) => <option key={link.href} value={link.href}>{link.label}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        </div>

        <nav aria-label="Admin navigation" className="hidden border-t border-zinc-100 px-5 py-4 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-6 lg:overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.title} className="shrink-0">
              <p className="hidden px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 lg:block">{section.title}</p>
              <div className="flex gap-1 lg:mt-2 lg:flex-col">
                {section.links.map((link) => {
                  const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));
                  return (
                    <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
                      className={`whitespace-nowrap rounded-lg px-3 py-2 text-[13px] transition-colors lg:block ${active ? "bg-zinc-950 font-semibold text-white" : "font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}>
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-zinc-100 p-4 lg:block">
          <Link href="/" className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">Ver website</Link>
          <button type="button" onClick={() => void logOut()} disabled={loggingOut} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50">
            {loggingOut ? "A sair…" : "Terminar sessão"}
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex justify-between border-b border-zinc-200 bg-white px-5 py-2.5 text-xs lg:hidden">
          <Link href="/" className="font-medium text-zinc-600">Voltar ao website</Link>
          <button type="button" disabled={loggingOut} onClick={() => void logOut()} className="font-semibold text-zinc-800">Terminar sessão</button>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
