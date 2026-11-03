-- IMPORTANT: APPLY ONLY AFTER the new account-based NavLog UI is live in
-- production. The current production UI still writes to this legacy table.
-- This migration makes the old 95 shared/default routes read-only for visitors
-- and signed-in users. Service-role maintenance remains available.

drop policy if exists "Allow delete navlog perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Allow insert navlog perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Allow update navlog perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Allow read navlog perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Anyone can delete public perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Anyone can insert public perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Anyone can update public perfect routes" on public.navlog_perfect_routes;
drop policy if exists "Anyone can read public perfect routes" on public.navlog_perfect_routes;

create policy "Read NavLog public library"
  on public.navlog_perfect_routes for select to anon, authenticated
  using (is_public = true);

revoke insert, update, delete on public.navlog_perfect_routes from anon, authenticated;
grant select on public.navlog_perfect_routes to anon, authenticated;
