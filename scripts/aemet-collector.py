#!/usr/bin/env python3
"""Fetch dated AEMET aviation charts and upload verified PNG images to Supabase.

Requires confirmed AEMET chart download URL templates. This program deliberately
refuses templates without date/run placeholders, preventing stale images from
being relabelled as current aviation forecasts.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import threading
import time
from urllib.parse import quote
from urllib.request import urlopen
from datetime import datetime, timedelta, timezone
import os
import re
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

SIGWX = re.compile(r"sigwx/\d{4}-\d{2}-\d{2}_(?:00|06|12|18)\.png\Z")
WIND = re.compile(r"wind-temp/\d{8}_HMAR(?:00|12)_H(?:003|006|009|012|015|018|021|024|027|030)_FL(?:020|050|100|150)\.png\Z")
FLIGHT_LEVELS = ("020", "050", "100", "150")
LEADS = (3, 6, 9, 12, 15, 18, 21, 24, 27, 30)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
MAX_BYTES = 15 * 1024 * 1024


def sigwx_slots(now: datetime) -> list[datetime]:
    # Cover the previous six hours and the next 24h (valid at 00,06,12,18 UTC).
    hour = (now.hour // 6) * 6
    current = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    return [current + timedelta(hours=6 * offset) for offset in range(-1, 5)]


def wind_runs(now: datetime) -> list[datetime]:
    # Include the previous published cycle as models can arrive late.
    run_hour = 12 if now.hour >= 12 else 0
    current = now.replace(hour=run_hour, minute=0, second=0, microsecond=0)
    return [current - timedelta(hours=12), current]


def source_urls(now: datetime, sigwx_template: str | None, wind_template: str | None) -> list[tuple[str, str]]:
    # SIGWX bulletin filename timestamp is the issue time (12h before validity).
    if sigwx_template and not ("{issue_date}" in sigwx_template and "{issue_time}" in sigwx_template):
        raise ValueError("SIGWX URL template must contain {issue_date} and {issue_time}")
    if wind_template and not all(token in wind_template for token in ("{run_date}", "{run_hour}", "{lead}", "{flight_level}")):
        raise ValueError("Wind URL template needs {run_date}, {run_hour}, {lead} and {flight_level}")
    urls: list[tuple[str, str]] = []
    for validity in sigwx_slots(now) if sigwx_template else ():
        date = validity.strftime("%Y-%m-%d")
        hour = validity.strftime("%H")
        path = f"sigwx/{date}_{hour}.png"
        issued = validity - timedelta(hours=12)
        url = sigwx_template.format(
            issue_date=issued.strftime("%Y%m%d"),
            issue_time=issued.strftime("%H%M"),
            valid_date=date, valid_hour=hour,
            valid_yyyymmdd=validity.strftime("%Y%m%d"),
            valid_yyyymmddhh=validity.strftime("%Y%m%d%H"),
        )
        urls.append((path, url))
    for run in wind_runs(now) if wind_template else ():
        for lead in LEADS:
            for level in FLIGHT_LEVELS:
                path = f"wind-temp/{run:%Y%m%d}_HMAR{run:%H}_H{lead:03d}_FL{level}.png"
                url = wind_template.format(
                    run_date=run.strftime("%Y%m%d"),
                    run_hour=run.strftime("%H"),
                    lead=f"{lead:03d}",
                    flight_level=level,
                    valid_yyyymmddhh=(run + timedelta(hours=lead)).strftime("%Y%m%d%H"),
                )
                urls.append((path, url))
    return urls


def validate_aemet_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ValueError("Only HTTPS chart URLs are accepted")
    host = parsed.hostname.lower()
    if host != "aemet.es" and not host.endswith(".aemet.es"):
        raise ValueError("Chart source must be hosted on an AEMET domain")


class RestrictedRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_aemet_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


CLIENT = build_opener(RestrictedRedirects())


def request_png(url: str, token: str | None) -> bytes | None:
    validate_aemet_url(url)
    headers = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36", "Accept": "image/png,image/*;q=0.8,*/*;q=0.1"}
    if token:
        headers["Authorization"] = token
    req = Request(url, headers=headers)
    try:
        with CLIENT.open(req, timeout=12) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES or len(data) < 32 or data[:8] != PNG_SIGNATURE:
                raise ValueError("AEMET response was not a valid PNG")
            width = int.from_bytes(data[16:20], "big")
            height = int.from_bytes(data[20:24], "big")
            if not (400 <= width <= 10000 and 400 <= height <= 10000):
                raise ValueError("AEMET PNG dimensions outside accepted range")
            return data
    except HTTPError as exc:
        if exc.code in (404, 410):
            return None  # Product not issued yet.
        if exc.code in (401, 403):
            raise RuntimeError("AEMET image URL returned access denied (previous VM URLs worked without login)") from exc
        raise RuntimeError(f"AEMET response HTTP {exc.code}") from exc


OIDC_LOCK = threading.Lock()
OIDC_CACHED = ("", 0.0)
SINK = "https://xyyodgojcrdkleuyicjn.supabase.co/functions/v1/receive-aemet-chart"


def github_identity_token() -> str:
    """Fetch GitHub's signed short-lived workflow identity; no saved Supabase key."""
    global OIDC_CACHED
    with OIDC_LOCK:
        if OIDC_CACHED[0] and time.monotonic() < OIDC_CACHED[1]:
            return OIDC_CACHED[0]
        endpoint = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_URL", "")
        runner_key = os.environ.get("ACTIONS_ID_TOKEN_REQUEST_TOKEN", "")
        if not endpoint or not runner_key:
            raise RuntimeError("GitHub Actions OIDC permission is missing")
        url = endpoint + ("&" if "?" in endpoint else "?") + "audience=briefings-aemet-charts"
        req = Request(url, headers={"Authorization": "Bearer " + runner_key})
        with urlopen(req, timeout=15) as response:
            token = json.load(response)["value"]
        if not token:
            raise RuntimeError("GitHub did not issue an OIDC token")
        OIDC_CACHED = (token, time.monotonic() + 165)
        return token


def upload_chart(path: str, png: bytes) -> None:
    """Only the OIDC-authorized Supabase function can insert images."""
    if not (SIGWX.fullmatch(path) or WIND.fullmatch(path)):
        raise ValueError("Unsafe or unexpected Supabase path")
    target = SINK + "?path=" + quote(path, safe="/")
    req = Request(
        target, data=png, method="POST",
        headers={
            "Authorization": "Bearer " + github_identity_token(),
            "Content-Type": "image/png",
        },
    )
    try:
        with urlopen(req, timeout=35) as response:
            if response.status not in (200, 201):
                raise RuntimeError("Chart receiver HTTP " + str(response.status))
    except HTTPError as exc:
        raise RuntimeError("Chart receiver HTTP " + str(exc.code)) from exc


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Validate templates and print filenames without network access")
    parser.add_argument("--kind", choices=("all", "sigwx", "wind-temp"), default="all")
    args = parser.parse_args()

    # Confirmed VM filename layout; wind path was verified with HTTP 200 PNG.
    sigwx = os.environ.get("AEMET_SIGWX_URL_TEMPLATE", "https://ama.aemet.es/o/estaticos/bbdd/imagenes/QGQE70LEMM{issue_time}________{issue_date}.png")
    wind = os.environ.get(
        "AEMET_WIND_URL_TEMPLATE",
        "https://ama.aemet.es/o/estaticos/productos/atap/"
        "{run_date}/HMAR/{run_hour}/P3/{lead}/VTPLOT_FL{flight_level}__.1.png",
    )
    now = datetime.now(timezone.utc)
    entries = source_urls(now, sigwx if args.kind != "wind-temp" else None,
                          wind if args.kind != "sigwx" else None)
    for _, url in entries:
        validate_aemet_url(url)

    if args.dry_run:
        for path, _ in entries:
            print("Validated:", path)
        return 0

    token = os.environ.get("AEMET_AUTHORIZATION")
    uploaded = 0
    missing = 0
    failed = []
    # GitHub runners fetch charts concurrently to avoid long waits if AEMET is slow.
    def collect(item: tuple[str, str]) -> tuple[str, str]:
        path, url = item
        try:
            png = request_png(url, token)
            if png is None:
                return path, "not-issued"
            upload_chart(path, png)
            return path, "uploaded"
        except (ValueError, HTTPError, URLError, RuntimeError, TimeoutError, OSError) as exc:
            return path, "FAILED " + str(exc)[:220]

    # Fail immediately if GitHub is not permitted to issue a signed OIDC token.
    github_identity_token()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        for path, outcome in executor.map(collect, entries):
            if outcome == "uploaded":
                uploaded += 1
                print("Uploaded", path, flush=True)
            elif outcome == "not-issued":
                missing += 1
            else:
                failed.append(path + " " + outcome)
                print("FAILED", path, outcome, file=sys.stderr, flush=True)

    print(f"Summary: {uploaded} uploaded, {missing} unavailable, {len(failed)} errors")
    if uploaded == 0 or failed:
        raise RuntimeError("AEMET upload incomplete; inspect the errors above")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, ValueError, HTTPError, URLError, RuntimeError) as exc:
        print(f"Collector failed: {exc}", file=sys.stderr)
        sys.exit(1)
