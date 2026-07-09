#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Overlay:
    source_href: str
    output_href: str
    level: int
    north: float
    south: float
    east: float
    west: float


def require_command(name: str) -> None:
    if shutil.which(name) is None:
        print(f"{name} was not found. Install GDAL first.", file=sys.stderr)
        print("Ubuntu/Codespaces: sudo apt-get update && sudo apt-get install -y gdal-bin", file=sys.stderr)
        print("macOS: brew install gdal", file=sys.stderr)
        raise SystemExit(1)


def parse_ground_overlays(kml_text: str) -> list[Overlay]:
    pattern = re.compile(
        r"<GroundOverlay>.*?"
        r"<href>(?P<href>[^<]+)</href>.*?"
        r"<LatLonBox>.*?"
        r"<north>(?P<north>[^<]+)</north>.*?"
        r"<south>(?P<south>[^<]+)</south>.*?"
        r"<east>(?P<east>[^<]+)</east>.*?"
        r"<west>(?P<west>[^<]+)</west>.*?"
        r"</LatLonBox>.*?"
        r"</GroundOverlay>",
        re.DOTALL,
    )

    overlays: list[Overlay] = []

    for match in pattern.finditer(kml_text):
        href = match.group("href").strip()
        level_match = re.search(r"_L(?P<level>\d+)_\d+_\d+\.tiff?$", href, re.IGNORECASE)

        if not level_match:
            continue

        stem = Path(href).stem
        overlays.append(
            Overlay(
                source_href=href,
                output_href=f"images/{stem}.png",
                level=int(level_match.group("level")),
                north=float(match.group("north")),
                south=float(match.group("south")),
                east=float(match.group("east")),
                west=float(match.group("west")),
            )
        )

    return overlays


def convert_overlay(
    kmz_path: Path,
    output_dir: Path,
    overlay: Overlay,
    overwrite: bool,
) -> tuple[str, bool]:
    output_path = output_dir / overlay.output_href

    if output_path.exists() and not overwrite:
        return overlay.output_href, False

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="vfr-kmz-") as tmp_name:
        tmp_path = Path(tmp_name)
        extracted_path = tmp_path / Path(overlay.source_href).name

        with zipfile.ZipFile(kmz_path) as kmz:
            with kmz.open(overlay.source_href) as source, extracted_path.open("wb") as target:
                shutil.copyfileobj(source, target)

        subprocess.run(
            [
                "gdal_translate",
                "-q",
                "-of",
                "PNG",
                "-expand",
                "rgba",
                str(extracted_path),
                str(output_path),
            ],
            check=True,
        )

    return overlay.output_href, True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert the ANC Portugal KMZ SuperOverlay TIFF images into web PNG overlays."
    )
    parser.add_argument("kmz", help="Path to ANC_Portugal_500k_KMZ_2022_600dpi.kmz")
    parser.add_argument(
        "--output-dir",
        default="public/vfr-chart",
        help="Output directory for manifest.json and PNG images.",
    )
    parser.add_argument(
        "--min-level",
        type=int,
        default=1,
        help="Lowest KMZ pyramid level to convert.",
    )
    parser.add_argument(
        "--max-level",
        type=int,
        default=7,
        help="Highest KMZ pyramid level to convert.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=max(1, min(4, os.cpu_count() or 1)),
        help="Parallel image conversions.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing PNGs.",
    )
    args = parser.parse_args()

    require_command("gdal_translate")

    kmz_path = Path(args.kmz)
    output_dir = Path(args.output_dir)

    if not kmz_path.exists():
        print(f"KMZ not found: {kmz_path}", file=sys.stderr)
        return 1

    output_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(kmz_path) as kmz:
        try:
            kml_text = kmz.read("doc.kml").decode("utf-8")
        except KeyError:
            print("doc.kml was not found inside the KMZ.", file=sys.stderr)
            return 1

        kmz_names = set(kmz.namelist())

    overlays = [
        overlay
        for overlay in parse_ground_overlays(kml_text)
        if args.min_level <= overlay.level <= args.max_level
    ]
    overlays = [overlay for overlay in overlays if overlay.source_href in kmz_names]

    if not overlays:
        print("No convertible GroundOverlay TIFF images were found in the requested levels.", file=sys.stderr)
        return 1

    print(f"Converting {len(overlays)} KMZ overlay images to PNG...")

    converted = 0
    skipped = 0

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [
            executor.submit(convert_overlay, kmz_path, output_dir, overlay, args.overwrite)
            for overlay in overlays
        ]

        for index, future in enumerate(as_completed(futures), start=1):
            href, did_convert = future.result()

            if did_convert:
                converted += 1
            else:
                skipped += 1

            if index == 1 or index % 25 == 0 or index == len(futures):
                print(f"{index}/{len(futures)} images processed; latest: {href}")

    min_south = min(overlay.south for overlay in overlays)
    max_north = max(overlay.north for overlay in overlays)
    min_west = min(overlay.west for overlay in overlays)
    max_east = max(overlay.east for overlay in overlays)

    manifest = {
        "type": "kml-superoverlay-image-manifest",
        "name": "ANC Portugal 1:500 000",
        "bounds": {
            "north": max_north,
            "south": min_south,
            "east": max_east,
            "west": min_west,
        },
        "levels": sorted({overlay.level for overlay in overlays}),
        "overlays": [
            {
                "href": overlay.output_href,
                "level": overlay.level,
                "north": overlay.north,
                "south": overlay.south,
                "east": overlay.east,
                "west": overlay.west,
            }
            for overlay in sorted(
                overlays,
                key=lambda item: (item.level, item.west, item.north, item.output_href),
            )
        ],
    }

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(f"Converted: {converted}; skipped existing: {skipped}")
    print(f"Manifest: {manifest_path}")
    print("Use this locally in .env.local:")
    print("NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=/vfr-chart/manifest.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
