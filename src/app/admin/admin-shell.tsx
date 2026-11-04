"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

// One destination per task. The old tools stay in source control, not in the UI.
const sections = [
  { title: "Gestão", links: [
    { href: "/admin", label: "Visão geral" },
    { href: "/admin/navlog-routes", label: "Rotas públicas" },
    { href: "/admin/accounts", label: "Contas de pilotos" },
    { href: "/admin/messages", label: "Mensagens e pedidos" },
  ] },
  { title: "Controlo", links: [
    { href: "/admin/ip-bans", label: "Acessos e bloqueios" },
    { href: "/admin/analytics", label: "Atividade" },
  ] },
] as const;

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const current = sections.some((section) => section.links.some((link) => link.href === pathname)) ? pathname : "/admin";

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const response = await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("Não foi possível terminar a sessão.");
      router.push("/admin");
      router.refresh();
    } catch {
      setLoggingOut(false);
      window.alert("Não foi possível terminar a sessão. Tenta novamente.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f6] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-b border-zinc-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="border-b border-zinc-100 px-5 py-6 lg:px-6 lg:py-8">
          <Link href="/admin" className="block">
            <span className="text-xl font-bold tracking-tight text-zinc-950">Briefings</span>
            <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Administração</span>
          </Link>
        </div>

        <nav aria-label="Navegação do Admin" className="hidden min-h-0 flex-1 space-y-7 overflow-y-auto px-3 py-6 lg:block">
          {sections.map((section) => <div key={section.title}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">{section.title}</p>
            <div className="mt-2 space-y-1">{section.links.map((link) => {
              const active = pathname === link.href || (link.href !== "/admin" && pathname.startsWith(`${link.href}/`));
              return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
                className={`block rounded-lg px-3 py-2.5 text-[13px] transition-colors ${active ? "bg-zinc-950 font-semibold text-white" : "font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"}`}>{link.label}</Link>;
            })}</div>
          </div>)}
        </nav>

        <div className="border-t border-zinc-100 px-5 py-4 lg:hidden">
          <label className="flex items-center gap-3 text-sm font-medium text-zinc-600">Secção
            <select value={current} onChange={(event) => router.push(event.target.value)} aria-label="Escolher página do Admin" className="h-11 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950">
              {sections.map((section) => <optgroup key={section.title} label={section.title}>{section.links.map((link) => <option key={link.href} value={link.href}>{link.label}</option>)}</optgroup>)}
            </select>
          </label>
        </div>

        <div className="hidden border-t border-zinc-100 px-4 py-5 lg:block">
          <p className="mb-3 px-3 text-[11px] text-zinc-500">Área privada do website</p>
          <Link href="/" className="block rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">← Voltar ao website</Link>
          <button type="button" onClick={() => void signOut()} disabled={loggingOut} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-40">{loggingOut ? "A terminar…" : "Terminar sessão"}</button>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3 text-xs lg:hidden"><Link href="/" className="font-medium text-zinc-700">Voltar ao website</Link><button type="button" onClick={() => void signOut()} disabled={loggingOut} className="font-semibold text-zinc-800">Terminar sessão</button></div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
