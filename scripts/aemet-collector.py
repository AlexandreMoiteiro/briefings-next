#!/usr/bin/env python3
"""AEMET chart collector: verified PNG downloads + Supabase Storage upload.

Source URLs must be supplied as a JSON manifest, not guessed from the filenames.
Manifest format: [{"path":"sigwx/2026-10-15_12.png","url":"https://..."},
{"path":"wind-temp/20261015_HMAR00_H003_FL020.png","url":"https://..."}].
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.request

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
SIGWX = re.compile(r"sigwx/\d{4}-\d{2}-\d{2}_(?:00|06|12|18)\.png\Z")
WIND = re.compile(r"wind-temp/\d{8}_HMAR(?:00|12)_H(?:003|006|009|012|015|018|021|024|027|030)_FL(?:020|050|100|150)\.png\Z")


def get_png(url: str, headers: dict[str, str]) -> bytes:
    if not url.startswith("https://"):
        raise ValueError("Chart source URL must use HTTPS")
    req = urllib.request.Request(url, headers={"User-Agent": "Briefings-AEMET-Collector/1.0", **headers})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(15 * 1024 * 1024 + 1)
        if len(data) > 15 * 1024 * 1024 or not data.startswith(PNG_MAGIC):
            raise ValueError("Source did not return a valid PNG (or is too large)")
        return data


def upload(base: str, key: str, path: str, data: bytes) -> None:
    req = urllib.request.Request(
        base.rstrip("/") + "/storage/v1/object/aemet-charts/" + path,
        data=data, method="POST",
        headers={"apikey": key, "Authorization": "Bearer " + key,
                 "Content-Type": "image/png", "x-upsert": "true"},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f"Storage upload returned HTTP {response.status}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--manifest", default=os.environ.get("AEMET_CHART_MANIFEST", ""))
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    if not args.manifest:
        print("AEMET_CHART_MANIFEST is missing. No charts have been uploaded.", file=sys.stderr)
        return 2
    manifest = json.loads(args.manifest)
    if not isinstance(manifest, list) or not manifest:
        raise ValueError("Manifest must contain at least one chart")
    base = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not args.dry_run and (not base.startswith("https://") or not key):
        print("Supabase credentials missing. No charts have been uploaded.", file=sys.stderr)
        return 2
    source_headers = {}
    if os.environ.get("AEMET_AUTHORIZATION"):
        source_headers["Authorization"] = os.environ["AEMET_AUTHORIZATION"]
    uploads = 0
    for item in manifest:
        path, url = item["path"], item["url"]
        if not (SIGWX.fullmatch(path) or WIND.fullmatch(path)):
            raise ValueError("Unexpected filename: " + path)
        if args.dry_run:
            print("Would download/upload: " + path)
            continue
        data = get_png(url, source_headers)
        upload(base, key, path, data)
        print("Uploaded:", path, len(data), "bytes")
        uploads += 1
    if not args.dry_run and uploads == 0:
        raise RuntimeError("No charts uploaded")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, KeyError, urllib.error.URLError, RuntimeError) as exc:
        print("Collector failed:", str(exc), file=sys.stderr)
        sys.exit(1)
