# NavLog — email sign-in and admin route curation

## Account interface

The NavLog header has a small "Sign in" / "My account" link leading to
`/navlog/account`. This is a dedicated, simple page with visible email/password
sign-in, create-account and password-reset options. No Google or Microsoft
providers are currently used. Visiting it keeps the current NavLog editing
draft in the browser tab's session storage; the user can return to NavLog.

Sign-in and saved private routes use the existing Supabase project. The NavLog
Preview sends account verification and PIN reset links using the verified Brevo
sender directly from the Vercel server; no domain purchase or Supabase-wide
SMTP change is required. A private Preview `BREVO_API_KEY` must first be
configured in Vercel. Details: [rollout notes](navlog-personal-routes-rollout.md).

## Shared route authorship and default routes

The old `public.navlog_perfect_routes` table has 95 public routes. None of its
`created_by` fields can establish authorship; the import's `source` field also
does not prove a specific author. The UI therefore treats all routes as
unverified until the owner curates them.

Admin → **NavLog routes** (`/admin/navlog-routes`) lets the owner:

- Search and select any public route.
- Flag it as a *Briefings route* / default only after personal verification.
- Set or clear its VFR/IFR category.
- Edit the name, description, waypoint order, code, name, coordinates,
  altitude, type and remarks. Untouched waypoint fields are preserved.

These choices are persisted in `public.navlog_route_curation`, publicly
readable but not writable by anonymous/authenticated clients. Admin edits are
made through an encrypted admin session and a Postgres function that checks
the existing admin usage code. Public NavLog reads the curation metadata and
shows chosen routes under "Briefings routes" and the others under "Community".

Seven legacy routes lack waypoint `code` values and instead use `name`. Editing
their classification or title does **not** rewrite the waypoints or route text;
the separate metadata-only admin function preserves their original geometry.
Explicit waypoint edits require valid codes before saving.

The legacy public table has permissive write policies used by the old
production interface. Do not revoke them until the new interface reaches
production, following the staged hardening SQL in `supabase/`.

Even owner-selected routes are planning templates. Pilots must check current
AIP, NOTAMs, weather, airspace and aircraft performance independently.
