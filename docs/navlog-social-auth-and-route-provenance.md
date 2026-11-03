# NavLog — social sign-in and route provenance

## Sign-in without a custom sending domain

The primary NavLog sign-in actions are Google and Microsoft (Supabase Auth
providers `google` and `azure`). Email/password remains collapsed under
"Use email and password instead"; registering by email will not be reliable for
external users until Supabase Auth has a verified SMTP sender.

The OAuth buttons require **provider setup** before they can actually sign a
user in. Never paste OAuth client secrets in source code or chat.

### Google

1. Create a Google Cloud project and configure its OAuth consent screen.
2. Create an OAuth client of type "Web application". Add this authorized
   redirect URI:
   `https://xyyodgojcrdkleuyicjn.supabase.co/auth/v1/callback`
3. In Supabase → Authentication → Providers → Google, enable Google and enter
   the OAuth client ID and secret.
4. Set appropriate Google application publishing / test-user permissions.

Official setup:
https://supabase.com/docs/guides/auth/social-sign-in/auth-google

### Microsoft

1. In Microsoft Entra ID → App registrations, register an application with
   support for the Microsoft account types that should be allowed (personal
   accounts and/or work/school).
2. Add the same Web redirect URI:
   `https://xyyodgojcrdkleuyicjn.supabase.co/auth/v1/callback`
3. Create a client secret.
4. In Supabase → Authentication → Providers → Azure, enable Azure, enter the
   application ID and client secret, and configure the appropriate Tenant URL.
   The NavLog client requests the required `email` scope.

Official setup:
https://supabase.com/docs/guides/auth/social-sign-in/auth-azure

In Supabase → Authentication → URL Configuration, keep Site URL set to the
production site `https://briefings-next-delta.vercel.app`, and allow the
production `/navlog` page and the Vercel preview branch's `/navlog` URL.
Do not enable production access until each provider has been tested.

## Authored routes versus community suggestions

The old `public.navlog_perfect_routes` table has 95 shared routes. Their
`created_by` columns are all empty. The import sources are 15 from
`routes.json` and 80 marked `seed`. **Import source is not authorship**.

To avoid misrepresenting user-contributed routes as authored or verified by
Alexandre, `src/lib/navlog-verified-routes.ts` starts with an empty list.
The NavLog shows an explicit "Briefings routes" tab (currently unverified,
empty) separately from the "Community" tab containing all 95 routes.

**Next step:** the site owner must confirm which exact route names/IDs were
personally authored. Add only those confirmed IDs to
`verifiedNavlogRouteIds` and redeploy the preview. No shared route is
deleted or changed by this classification.

Even verified routes are *planning templates* and cannot replace checks of
current AIP, NOTAMs, weather, airspace and aircraft performance.
