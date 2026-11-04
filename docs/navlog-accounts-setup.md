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

The NavLog Preview uses Supabase Admin `generateLink()` to create the signup
and recovery links **without** invoking Supabase's email sender. The Next.js
server then sends each link with the Brevo transactional API. This avoids
changing project-wide Supabase SMTP settings during Preview, while keeping
Supabase Auth as the sole account and session provider.

Set `BREVO_API_KEY` directly in the Vercel project's **Preview** environment as
a Secret. This is a Brevo **API** key, not an SMTP password or relay key.
Brevo must have the existing sender `Briefings <noreply.briefings@gmail.com>`
verified. On Brevo's free sender domain, the visible email may be rewritten to
`@...brevosend.com`; that behaviour is expected. Do not paste the key into
chat, code, a PR, or a public environment variable.

Optional `NAVLOG_PUBLIC_URL` selects a fixed HTTPS origin for the links;
otherwise Vercel's system `VERCEL_URL` is used. Signup fails closed if the
Brevo key is missing, so an account is not silently created without a way
to receive its verification email. A failed API delivery after account
creation can be retried using **Resend confirmation email**.

Update Supabase Auth redirect allowlist for the relevant Vercel preview URL,
production URL, `/navlog`, and `/navlog/reset-password`. Test account creation,
verification, login, route saving, forgotten PIN, and PIN reset. The resend
form asks for the original username and email. If they match an unconfirmed
account, it sends a one-time email login link, which verifies the address
without changing the user's PIN. This link should not be forwarded.

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
