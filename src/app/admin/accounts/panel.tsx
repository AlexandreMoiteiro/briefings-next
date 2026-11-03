"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

type Account = {
  user_id: string;
  username: string | null;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  route_count: number;
  last_route_updated_at: string | null;
};

function formatDate(date: string | null) {
  if (!date) return "—";
  return new Date(date).toLocaleString("pt-PT", { dateStyle: "medium", timeStyle: "short" });
}

export function AdminAccountsPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "confirmed" | "pending">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [accountNotice, setAccountNotice] = useState("");

  function openAccount(account: Account) {
    setSelected(account.user_id === selected ? null : account.user_id);
    setEditUsername(account.username ?? "");
    setAccountNotice("");
  }

  async function renameAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || savingUsername) return;
    if (!window.confirm("Alterar o username deste utilizador? O login com o username antigo deixará de funcionar.")) return;
    setSavingUsername(true);
    setAccountNotice("");
    setError("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selected, username: editUsername.trim() }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível guardar o username.");
      setAccounts((previous) => previous.map((account) => account.user_id === selected ? { ...account, username: editUsername.trim() } : account));
      setAccountNotice("Username atualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar esta conta.");
    } finally {
      setSavingUsername(false);
    }
  }

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/accounts", { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível carregar as contas. Inicia sessão no Admin novamente.");
      const result = await response.json() as { accounts: Account[] };
      setAccounts(result.accounts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro ao obter contas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    void fetch("/api/admin/accounts", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar as contas.");
        const result = await response.json() as { accounts: Account[] };
        if (mounted) setAccounts(result.accounts);
      })
      .catch((cause) => { if (mounted) setError(cause instanceof Error ? cause.message : "Erro ao obter contas."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts.filter((account) =>
      (status === "all" || (status === "confirmed") === Boolean(account.email_confirmed_at)) &&
      (!needle || account.email?.toLowerCase().includes(needle) || account.username?.toLowerCase().includes(needle))
    );
  }, [accounts, search, status]);

  const verified = accounts.filter((account) => Boolean(account.email_confirmed_at)).length;
  const active = accounts.filter((account) => Boolean(account.last_sign_in_at)).length;
  const savedRoutes = accounts.reduce((total, account) => total + Number(account.route_count || 0), 0);
  const selectedAccount = accounts.find((account) => account.user_id === selected);

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-9">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">NavLog · Utilizadores</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-950">Contas de utilizadores</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Identifica os utilizadores, confirma os seus usernames e acompanha a utilização das rotas privadas.</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["Contas registadas", accounts.length],
            ["E-mails confirmados", verified],
            ["Contas já utilizadas", active],
            ["Rotas pessoais", savedRoutes],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">{value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Utilizadores</h2>
              <p className="mt-1 text-xs text-zinc-500">{filtered.length} contas encontradas · Dados das contas visíveis apenas no Admin</p>
            </div>
            <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 disabled:opacity-40">{loading ? "A carregar…" : "Atualizar"}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="admin-accounts-search" className="sr-only">Pesquisar contas</label>
            <input id="admin-accounts-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por username ou e-mail…" className="h-11 min-w-48 flex-1 rounded-lg border border-zinc-300 px-3 text-sm" />
            <label className="sr-only" htmlFor="admin-accounts-status">Estado da conta</label>
            <select id="admin-accounts-status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-11 rounded-lg border border-zinc-300 bg-white px-3 text-sm">
              <option value="all">Todas</option><option value="confirmed">Confirmadas</option><option value="pending">Por confirmar</option>
            </select>
          </div>

          {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : null}
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr><th className="px-4 py-3 font-medium">Utilizador</th><th className="px-4 py-3 font-medium">Registado</th><th className="px-4 py-3 font-medium">Último acesso</th><th className="px-4 py-3 text-right font-medium">Rotas</th><th className="px-4 py-3 font-medium">Estado</th></tr>
              </thead>
              <tbody>
                {loading && !accounts.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">A carregar contas…</td></tr>
                  : filtered.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-500">{accounts.length ? "Não há contas com estes filtros." : "Ainda não existem contas de utilizadores."}</td></tr>
                    : filtered.map((account) => (
                      <tr key={account.user_id} className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 ${selected === account.user_id ? "bg-zinc-50" : ""}`}>
                        <td className="px-4 py-3"><button type="button" onClick={() => openAccount(account)} className="text-left underline-offset-2 hover:underline"><strong className="block font-semibold text-zinc-900">{account.username || "Username por definir"}</strong><span className="text-xs text-zinc-600">{account.email ?? "—"}</span></button></td>
                        <td className="px-4 py-3 text-zinc-600">{formatDate(account.created_at)}</td>
                        <td className="px-4 py-3 text-zinc-600">{formatDate(account.last_sign_in_at)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-800">{account.route_count}</td>
                        <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 text-xs ${account.email_confirmed_at ? "border-zinc-300 text-zinc-800" : "border-zinc-200 text-zinc-500"}`}>{account.email_confirmed_at ? "Confirmada" : "Por confirmar"}</span></td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {selectedAccount ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <h3 className="text-sm font-semibold text-zinc-900">Detalhes de {selectedAccount.username || selectedAccount.email}</h3>
              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                <div><dt className="text-zinc-500">E-mail</dt><dd className="mt-1 break-all font-medium text-zinc-800">{selectedAccount.email ?? "—"}</dd></div>
                <div><dt className="text-zinc-500">Última alteração a rotas</dt><dd className="mt-1 font-medium text-zinc-800">{formatDate(selectedAccount.last_route_updated_at)}</dd></div>
                <div><dt className="text-zinc-500">Confirmação do e-mail</dt><dd className="mt-1 font-medium text-zinc-800">{formatDate(selectedAccount.email_confirmed_at)}</dd></div>
                <div><dt className="text-zinc-500">Identificador da conta</dt><dd className="mt-1 break-all font-mono text-zinc-700">{selectedAccount.user_id}</dd></div>
              </dl>
              <form onSubmit={(event) => void renameAccount(event)} className="mt-5 flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-4">
                <label className="min-w-44 flex-1 text-xs font-medium text-zinc-600">Alterar username
                  <input value={editUsername} onChange={(event) => setEditUsername(event.target.value)} required minLength={3} maxLength={24} pattern="[A-Za-z0-9._-]{3,24}" className="mt-1.5 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900" />
                </label>
                <button type="submit" disabled={savingUsername || editUsername.trim() === selectedAccount.username} className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-40">{savingUsername ? "A guardar…" : "Guardar username"}</button>
              </form>
              {accountNotice ? <p role="status" className="mt-2 text-xs text-zinc-700">{accountNotice}</p> : null}
            </div>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-zinc-500">Esta página mostra apenas dados da conta e estatísticas de utilização. Não abre o conteúdo das rotas privadas dos pilotos.</p>
        </section>
      </div>
    </main>
  );
}
