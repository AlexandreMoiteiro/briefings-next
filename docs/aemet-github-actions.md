# AEMET aviation charts — GitHub Actions replacement for the Google VM

This replaces the deleted `briefings-aemet-test` VM collector with a GitHub runner. It does **not** claim to know AEMET private aviation-chart download endpoints or bypass AMA authentication.

## Current state

- The old VM scripts (`fetch-sigwx.sh`, `fetch-wind-temp.sh`, `sync-supabase.sh`) are no longer available.
- The Briefings API already reads valid PNGs from Supabase Storage bucket `aemet-charts`.
- `scripts/aemet-collector.py` generates dated AEMET chart requests and uploads validated PNGs to that bucket.
- GitHub Actions is **manual-only** until confirmed AEMET download URL templates, authorization, and an end-to-end test are available.

The correct source is the AEMET aeronautical AMA portal (`https://ama.aemet.es/mapas-aeronauticos`), which is access-restricted. A generic website URL is **not** a download URL.

## One-time GitHub Actions secrets

Set these under **GitHub repository → Settings → Secrets and variables → Actions → New repository secret**. Never put these values in a commit or chat:

| Secret | Purpose |
| --- | --- |
| `AEMET_SIGWX_URL_TEMPLATE` | Confirmed, authorized direct HTTPS PNG URL pattern for Spanish SIGWX (must include `{valid_date}` and `{valid_hour}`). |
| `AEMET_WIND_URL_TEMPLATE` | Confirmed, authorized direct HTTPS PNG URL pattern for HMAR wind/temp (must include `{run_date}`, `{run_hour}`, `{lead}`, `{flight_level}`). |
| `AEMET_AUTHORIZATION` | Optional official API Authorization header, **if supported and supplied** by AEMET. Do not paste personal browser session cookies. |
| `SUPABASE_URL` | `https://xyyodgojcrdkleuyicjn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server-side service role key (never a public/anon key). |

The URL templates must come from an actual authorized AEMET chart request or published AEMET API contract, **not guessed**. If AMA only offers interactive browser sessions and no automation-friendly chart API, ask AEMET about authorized redistribution and machine access before enabling unattended transfers.

### Supported placeholders

SIGWX: `{valid_date}` (YYYY-MM-DD), `{valid_hour}` (00/06/12/18), `{valid_yyyymmdd}`, `{valid_yyyymmddhh}`.

Wind: `{run_date}` (YYYYMMDD), `{run_hour}` (00/12), `{lead}` (003…030), `{flight_level}` (020/050/100/150), `{valid_yyyymmddhh}`.

The collector checks the source domain, file type and image dimensions; it fails rather than uploading an HTML login screen or relabeling a single “latest” chart as different validity periods.

## Verify and enable

1. Obtain approved AEMET chart URLs, confirm the chart use/redistribution terms and set GitHub secrets.
2. In **Actions → AEMET aviation charts → Run workflow**, select `sigwx`, `wind-temp` or `all`.
3. Confirm successful uploads to Supabase Storage and valid chart visibility in the Preview Meteorology page.
4. **Only then** add `schedule:` to the workflow, e.g. UTC `35 */3 * * *`, and monitor failures.

Note that scheduled GitHub Actions jobs may be delayed or skipped during platform load. Monitoring must detect stale charts; the client should not display them as current flight-planning data.

## Offline test

```bash
python3 -m unittest discover -s tests -p 'test_aemet_collector.py' -v
```
