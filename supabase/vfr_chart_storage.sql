-- Public, read-only-at-the-application-layer storage for generated VFR XYZ tiles.
-- Uploads use a server-side Supabase secret key through scripts/upload-vfr-tiles.mjs.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'vfr-chart',
  'vfr-chart',
  true,
  5242880,
  array['image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
