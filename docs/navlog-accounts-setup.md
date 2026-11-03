# NavLog accounts — setup

The NavLog popup accepts email, a chosen username (a FlightLogger callsign is
recommended, not required), and a four-number PIN. Pilots can sign in using
their username or email. Only signed-in pilots can save routes privately.

## Required private Vercel environment variables

- `SUPABASE_SECRET_KEY`: copy an `sb_secret_...` key from the project's
  Supabase Settings → API Keys page. Configure as a **server-only** secret.
  Legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted too, but deprecated.
  Do not prefix either key with `NEXT_PUBLIC_`.
- `NAVLOG_PIN_PEPPER`: a new, random, secret string at least 32 characters long.
  Generate it with `openssl rand -hex 32`. Keep the value safely; rotating it
  invalidates all existing four-number PINs until users reset them.

Both variables are needed on Preview and Production environments. Redeploy
after setting them. Do **not** share the values in chat or commit them.

## Email confirmation and recovery

Supabase Auth normally requires email confirmation for new accounts. Its
default email service is limited to pre-authorized addresses; configure a
custom SMTP sender (e.g. Resend) with a domain you control before inviting
pilots. A free community subdomain is possible but requires that service's
approval and appropriate DNS records. The existing Vercel `RESEND_API_KEY`
does **not** automatically configure Supabase SMTP.

Update Supabase Auth redirect allowlist for the relevant Vercel preview URL,
production URL, `/navlog`, and `/navlog/reset-password`. Test account creation,
verification, login, route saving, forgotten PIN, and PIN reset.

## Security

Supabase Auth cannot store a literal four-digit password: server code instead
derives a long secret password from email, PIN and the private pepper. The PIN
itself is not stored. Login attempts are limited in Postgres to five attempts
per account and thirty per IP key per fifteen minutes. A four-digit PIN is
inherently weaker than a long password; avoid reused or obvious numbers. The
Supabase service-role key must never be sent to the browser.

Admin account management uses the existing protected Admin session and displays
username, email, signup time, last sign-in, number of privately saved routes and
last route edit. Admin may rename usernames but does not see route contents.
