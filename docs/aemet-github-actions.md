# AEMET aviation charts — reconstruction from previously verified Briefings VM setup

The original collectors were verified with HTTP 200 + image/png from the Madrid VM on 11 October 2026. They downloaded the AEMET PNGs directly **without any AMA browser login**. The web portal may require a login for other features; that is distinct from these image URLs.

## Recovered, tested source conventions

### SIGWX Spain

Official PNG filename: `QGQE70LEMM{issue_time}________{issue_date}.png`

- Issue date: YYYYMMDD; issue time: HHMM (UTC).
- Issue time = chart validity **minus 12 hours** (previous-day rollover included).
- Validity slots: 00/06/12/18 UTC.
- Stored under Supabase `aemet-charts/sigwx/YYYY-MM-DD_HH.png`, matching the existing Meteorology reader.
- **The precise SIGWX directory prefix is the one detail not preserved outside the deleted VM**. Supply it once as `AEMET_SIGWX_URL_TEMPLATE`; do not guess it or substitute an AMA HTML page. Example filename template syntax: `https://ama.aemet.es/<verified-directory>/QGQE70LEMM{issue_time}________{issue_date}.png` (the `<verified-directory>` portion is a placeholder, not a URL).

### Wind / Temperature

Previously verified direct source pattern:

```text
https://ama.aemet.es/o/estaticos/productos/atap/{run_date}/HMAR/{run_hour}/P3/{lead}/VTPLOT_FL{flight_level}__.1.png
```

- Two daily model cycles: 00 and 12 UTC; include previous cycle when new products have not appeared.
- Leads: H+003, H+006, ... H+030.
- Levels: FL020, FL050, FL100, FL150.
- Stored under `aemet-charts/wind-temp/YYYYMMDD_HMARHH_HNNN_FLNNN.png`, matching Briefings.
- No AEMET authorization header was needed for the validated VM downloads.

## GitHub Actions setup

The workflow is at `.github/workflows/aemet-charts.yml` and the collector at `scripts/aemet-collector.py`.

GitHub repository **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
| --- | --- |
| `SUPABASE_URL` | `https://xyyodgojcrdkleuyicjn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service role key used for Storage uploads; never expose it client-side. |
| `AEMET_SIGWX_URL_TEMPLATE` | One-time exact SIGWX PNG directory+filename URL pattern. Still needs recovery/verification. |
| `AEMET_WIND_URL_TEMPLATE` | Optional override. Already defaults to the previously validated HMAR URL pattern. |
| `AEMET_AUTHORIZATION` | Optional; not needed in the previous successful VM tests. |

The collector supports `--kind wind-temp` **without the SIGWX URL configuration**, so once Supabase upload secrets are set, the wind collector can be tested independently.

### Run and verify

1. Run `python3 -m unittest discover -s tests -p 'test_aemet_collector.py' -v` to check filenames/date handling without network access.
2. Configure Supabase secrets in GitHub Actions.
3. Trigger **AEMET aviation charts → Run workflow → wind-temp** once and check the logs for HTTP 200 PNG uploads. The workflow must be present on the repository's default branch for dispatch.
4. Check newly uploaded objects in Supabase bucket `aemet-charts` and verify the Meteorology page.
5. After recovering the SIGWX directory, trigger `sigwx` separately and check likewise.
6. Only after successful runs for both products, enable GitHub Actions scheduling. Scheduled workflows execute from the default branch and can occasionally be delayed.

The GitHub workflow remains manual-only to avoid silent false claims that forecasts are updating. The Production Vercel app does not need any code changes to read new PNGs.

## Safety and use

AEMET charts are time-sensitive aviation products. A missing/failing download must **not** be relabelled with a current timestamp. The collector checks source domain, PNG signatures and dimensions, and fails on invalid content. Confirm current validity and forecast limitations before operational use.
