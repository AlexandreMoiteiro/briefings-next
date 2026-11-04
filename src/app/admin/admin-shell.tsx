"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

const sections = [
  { title: "WORKSPACE", links: [{ href: "/admin", label: "Visão geral", glyph: "◫" }, { href: "/admin/analytics", label: "Atividade", glyph: "▥" }] },
  { title: "NAVLOG", links: [{ href: "/admin/navlog-routes", label: "Rotas públicas", glyph: "⌁" }, { href: "/admin/accounts", label: "Contas de pilotos", glyph: "◉" }] },
  { title: "COMUNICAÇÃO", links: [{ href: "/admin/messages", label: "Mensagens", glyph: "✉" }, { href: "/admin/unblock-requests", label: "Pedidos de acesso", glyph: "↗" }] },
  { title: "SEGURANÇA", links: [{ href: "/admin/ip-bans", label: "Bloqueios de IP", glyph: "◇" }, { href: "/admin/export-access", label: "Exportações", glyph: "⇩" }] },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const selectedSection = sections.some((section) => section.links.some((link) => link.href === pathname)) ? pathname : "/admin";

  async function logOut() {
    if (loggingOut) return;
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
    <div className="min-h-screen bg-[#f5f6f3] lg:grid lg:grid-cols-[266px_minmax(0,1fr)]">
      <aside className="relative flex flex-col bg-[#12221d] text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-5 lg:px-7 lg:py-8">
          <Link href="/admin" className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-[#d6f4de] text-lg font-black tracking-tight text-[#153c2a]">B.</span>
            <span><span className="block text-lg font-bold tracking-tight">Briefings</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.2em] text-[#a0bcac]">Control centre</span></span>
          </Link>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-200 lg:hidden">Admin</span>
        </div>

        <div className="border-b border-white/10 px-5 py-4 lg:hidden">
          <label className="flex items-center gap-3 text-xs font-semibold text-emerald-100">Área
            <select aria-label="Escolher área do Admin" value={selectedSection} onChange={(event) => router.push(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-white/20 bg-[#20382e] px-3 text-sm font-medium text-white">
              {sections.map((section) => <optgroup key={section.title} label={section.title}>{section.links.map((link) => <option key={link.href} value={link.href}>{link.label}</option>)}</optgroup>)}
            </select>
          </label>
        </div>

        <nav aria-label="Navegação do Admin" className="hidden min-h-0 flex-1 overflow-y-auto px-4 py-7 lg:block">
          <div className="space-y-7">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="px-3 text-[10px] font-bold tracking-[0.18em] text-[#759485]">{section.title}</h2>
                <div className="mt-2 space-y-1">
                  {section.links.map((link) => {
                    const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));
                    return (
                      <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${active ? "bg-[#d6f4de] font-semibold text-[#17392a]" : "font-medium text-[#b7c9bd] hover:bg-white/10 hover:text-white"}`}>
                        <span aria-hidden="true" className={`flex size-7 items-center justify-center rounded-lg text-base ${active ? "bg-[#bcebc9]/70" : "bg-white/5 group-hover:bg-white/10"}`}>{link.glyph}</span>{link.label}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </nav>

        <div className="hidden border-t border-white/10 px-4 py-5 lg:block">
          <div className="mb-4 flex items-center gap-2 px-3 text-[11px] font-medium text-[#b7c9bd]"><span className="size-2 rounded-full bg-emerald-400" />Área administrativa protegida</div>
          <Link href="/" className="block rounded-xl px-3 py-2.5 text-sm font-medium text-[#c8d8cf] hover:bg-white/10">↗ Ver website</Link>
          <button type="button" onClick={() => void logOut()} disabled={loggingOut} className="mt-1 w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[#c8d8cf] hover:bg-white/10 disabled:opacity-40">{loggingOut ? "A terminar…" : "↪ Terminar sessão"}</button>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3 text-xs lg:hidden">
          <Link href="/" className="font-semibold text-zinc-700">↗ Website</Link>
          <button type="button" disabled={loggingOut} onClick={() => void logOut()} className="font-semibold text-red-700">Terminar sessão</button>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
