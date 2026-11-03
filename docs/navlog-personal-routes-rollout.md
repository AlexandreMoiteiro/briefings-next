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

Supabase's built-in SMTP is unsuitable for public sign-ups: it only emails project-team addresses (and is severely rate-limited). The existing Vercel `RESEND_API_KEY` does **not** automatically configure Supabase Auth. Configure this privately in **Supabase → Authentication → SMTP Settings**:

| Supabase field | Resend value |
| --- | --- |
| SMTP host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (TLS) |
| Username | `resend` |
| Password | Resend API key (insert in dashboard; never commit) |
| Sender email | An address on a domain verified in Resend |
| Sender name | `Briefings` |

Check that email/password sign-ups and confirmation emails are enabled. For the **Supabase → Authentication → URL Configuration** redirect allowlist, include the production site's `https://<domain>/navlog`, `https://<domain>/navlog/reset-password` and the equivalent Preview URLs for the selected branch (or the appropriate Vercel preview wildcard). Use the real domain, not the placeholders. Set the Site URL to the production website.

Check Resend's current free-tier limits and Auth email rate limits before inviting users. Existing alert emails and authentication emails share the same Resend allowance when using one account.

## After preview approval, during the production release

1. Promote the NavLog interface to production.
2. Apply [`supabase/navlog_public_library_lock_after_release.sql`](../supabase/navlog_public_library_lock_after_release.sql) to revoke public INSERT/UPDATE/DELETE on the **legacy** shared library. Do this only after the new interface is deployed, because the old production version still writes there.
3. Verify in production: guest opens a public route; a signed-in user creates and updates a private route; a second user cannot read or edit it; reset-password email is delivered.

The NavLog private-routes and public-route-curation migrations are already applied
to the existing Supabase project. The 95 legacy routes were not reclassified
automatically; they only become Briefings defaults after owner selection.
