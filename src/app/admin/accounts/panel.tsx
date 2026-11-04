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

type PrivateRoute = { id: string; name: string; created_at: string; updated_at: string };

function PilotPrivateRoutes({ userId, onDelete }: { userId: string; onDelete: () => void }) {
  const [routes, setRoutes] = useState<PrivateRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/accounts/routes?user_id=${encodeURIComponent(userId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { routes?: PrivateRoute[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar as rotas pessoais.");
        setRoutes(result.routes ?? []);
      })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Erro ao consultar as rotas."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId]);

  async function deletePrivateRoute(route: PrivateRoute) {
    if (busy || confirmation !== route.name) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/accounts/routes", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, route_id: route.id, confirm_name: confirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível eliminar a rota.");
      setRoutes((previous) => previous.filter((item) => item.id !== route.id));
      setRemoving("");
      setConfirmation("");
      onDelete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível eliminar esta rota.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t border-zinc-200 pt-5">
      <h4 className="text-sm font-semibold text-zinc-950">Rotas privadas deste piloto</h4>
      <p className="mt-1 text-xs leading-5 text-zinc-600">Consulta apenas nomes e datas. O conteúdo dos percursos continua privado. Podes remover uma rota específica sem apagar a conta.</p>
      {loading ? <p className="mt-4 text-xs text-zinc-500">A carregar rotas…</p>
        : routes.length === 0 ? <p className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">Este piloto não tem rotas guardadas.</p>
          : <div className="mt-4 divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
            {routes.map((route) => (
              <div key={route.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0"><p className="break-words text-sm font-semibold text-zinc-900">{route.name}</p><p className="mt-1 text-xs text-zinc-500">Atualizada: {formatDate(route.updated_at)}</p></div>
                  <button type="button" onClick={() => { setRemoving((current) => current === route.id ? "" : route.id); setConfirmation(""); }} className="rounded-lg border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">{removing === route.id ? "Cancelar" : "Eliminar rota"}</button>
                </div>
                {removing === route.id ? <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <label className="block text-xs text-red-900">Para eliminar, escreve exatamente: <strong>{route.name}</strong>
                    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" className="mt-2 h-10 w-full rounded-lg border border-red-200 bg-white px-3 text-sm text-zinc-900" />
                  </label>
                  <button type="button" disabled={busy || confirmation !== route.name} onClick={() => void deletePrivateRoute(route)} className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{busy ? "A eliminar…" : "Confirmar eliminação"}</button>
                </div> : null}
              </div>
            ))}
          </div>}
      {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}
    </section>
  );
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  function openAccount(account: Account) {
    setSelected(account.user_id === selected ? null : account.user_id);
    setEditUsername(account.username ?? "");
    setAccountNotice("");
    setDeleteOpen(false);
    setDeleteConfirmation("");
  }

  async function deleteAccount() {
    const target = accounts.find((account) => account.user_id === selected);
    if (!target?.email || deleting || deleteConfirmation !== target.email) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/accounts", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: target.user_id, confirm_email: deleteConfirmation }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível eliminar a conta.");
      setAccounts((previous) => previous.filter((account) => account.user_id !== target.user_id));
      setSelected(null);
      setDeleteOpen(false);
      setDeleteConfirmation("");
      setAccountNotice("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível eliminar esta conta.");
    } finally {
      setDeleting(false);
    }
  }

  async function renameAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || savingUsername) return;
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
    <main className="min-h-screen px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">NavLog / Gestão de pilotos</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl">Contas de pilotos</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">Pesquisa contas, consulta o estado dos acessos e gere os usernames ou a eliminação de registos.</p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([
            ["Contas registadas", accounts.length],
            ["E-mails confirmados", verified],
            ["Contas já utilizadas", active],
            ["Rotas pessoais", savedRoutes],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm shadow-zinc-200/30">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-zinc-950">{loading && !accounts.length ? "—" : value}</p>
            </div>
          ))}
        </div>

        <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm shadow-zinc-200/30 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-950">Diretório de pilotos</h2>
              <p className="mt-1 text-xs text-zinc-500">{filtered.length} contas encontradas · Seleciona uma conta para gerir</p>
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
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50/70">
              <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Ficha de piloto</p>
                  <h3 className="mt-1 text-lg font-semibold text-zinc-900">{selectedAccount.username || selectedAccount.email}</h3>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label="Fechar detalhes" className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">Fechar ×</button>
              </div>
              <div className="p-5">
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
              <p className="mt-2 text-xs text-zinc-500">Ao alterar o username, o anterior deixa de ser válido para iniciar sessão. O e-mail e o PIN não mudam.</p>
              {accountNotice ? <p role="status" className="mt-2 text-xs text-zinc-700">{accountNotice}</p> : null}
              <PilotPrivateRoutes key={selectedAccount.user_id} userId={selectedAccount.user_id} onDelete={() => void refresh()} />
              <div className="mt-6 border-t border-red-200 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">Eliminar conta</p>
                    <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-600">Remove o acesso, o perfil e as {selectedAccount.route_count} rotas privadas deste piloto. As rotas públicas existentes na biblioteca mantêm-se, sem associação ao utilizador. Esta ação é irreversível.</p>
                  </div>
                  <button type="button" onClick={() => { setDeleteOpen((current) => !current); setDeleteConfirmation(""); }} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50">{deleteOpen ? "Cancelar" : "Eliminar conta…"}</button>
                </div>
                {deleteOpen ? (
                  <div className="mt-4 rounded-xl border border-red-200 bg-red-50/70 p-4">
                    <p className="text-sm font-semibold text-red-900">Confirmar eliminação permanente</p>
                    <p className="mt-1 text-xs leading-5 text-red-800">Escreve exatamente o e-mail <strong className="break-all">{selectedAccount.email ?? ""}</strong> para confirmar que escolheste a conta correta.</p>
                    <label className="mt-3 block text-xs font-medium text-red-900">E-mail de confirmação
                      <input type="text" autoComplete="off" spellCheck={false} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="Escreve o e-mail completo" className="mt-1.5 h-11 w-full rounded-lg border border-red-200 bg-white px-3 text-sm text-zinc-950 focus:border-red-500 focus:outline-none" />
                    </label>
                    <button type="button" onClick={() => void deleteAccount()} disabled={deleting || !selectedAccount.email || deleteConfirmation !== selectedAccount.email} className="mt-3 rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{deleting ? "A eliminar…" : "Eliminar conta definitivamente"}</button>
                  </div>
                ) : null}
              </div>
              </div>
            </div>
          ) : null}
          <p className="mt-4 text-xs leading-5 text-zinc-500">A gestão de rotas pessoais usa apenas os seus nomes e datas. Os waypoints dos pilotos nunca são apresentados na consola.</p>
        </section>
      </div>
    </main>
  );
}
