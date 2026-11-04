# NavLog personal routes — rollout notes

## Implemented in the preview branch

- The 95 existing routes in `public.navlog_perfect_routes` remain available to everyone as a **public suggestion library**. The new UI does not write to this table.
- Visitors can still plan a route without registering.
- Supabase Auth email/password sign-up, sign-in, sign-out and reset-password flow.
- Small sign-in link in the NavLog header leading to `/navlog/account`, a
  dedicated email/password page. Google/Microsoft sign-in is not used.
- Each signed-in user can create, edit and delete only their own routes in `public.navlog_user_routes`.
- Private routes have PostgreSQL Row Level Security policies on `auth.uid()`; anonymous users have no table grants.
- Database caps: 100 routes per account, 120 waypoints and 64 KiB per saved route; automatic deletion when an Auth user is deleted.
- No new paid service or new Supabase project was created.
- Route provenance is not inferable from old import metadata. Owner-reviewed
  default routes and categories are managed under Admin → NavLog routes; see
  [route curation](navlog-email-auth-and-route-curation.md).

## Configure Auth emails before opening registration publicly

The dedicated NavLog Preview sends account emails using **Brevo**, without altering Supabase SMTP. Create a Brevo REST API key in Brevo's own dashboard, and install it as a Vercel **Preview-only** Secret named `BREVO_API_KEY` (not a public variable). The sender `Briefings <noreply.briefings@gmail.com>` must already be verified in Brevo; emails may appear as a Brevo-managed address due to its Gmail sender rewrite.

The app uses Supabase Admin `generateLink()` for signup and recovery links, then posts them to Brevo's transactional email API. This keeps login, private routes, session handling and PIN hashing in Supabase. Existing feedback/admin alerts continue to use their own `RESEND_API_KEY`; there is no need to create a domain or change Supabase's project-wide SMTP during Preview.

Check that email/password sign-ups and confirmation emails are enabled. In **Supabase → Authentication → URL Configuration**, add `https://<preview-host>/navlog` and `https://<preview-host>/navlog/reset-password` as allowed redirect URLs (or use a tightly scoped Vercel Preview wildcard). Keep the Site URL pointed at the real production site. Do not place credentials in this document or in GitHub.

Test registration, delivered confirmation, sign-in, private route saves, re-send, recovery, and reset in the Preview before any production release. Review Brevo's daily quota before a public launch.

## After preview approval, during the production release

1. Promote the NavLog interface to production.
2. Apply [`supabase/navlog_public_library_lock_after_release.sql`](../supabase/navlog_public_library_lock_after_release.sql) to revoke public INSERT/UPDATE/DELETE on the **legacy** shared library. Do this only after the new interface is deployed, because the old production version still writes there.
3. Verify in production: guest opens a public route; a signed-in user creates and updates a private route; a second user cannot read or edit it; reset-password email is delivered.

The NavLog private-routes and public-route-curation migrations are already applied
to the existing Supabase project. The 95 legacy routes were not reclassified
automatically; they only become Briefings defaults after owner selection.
