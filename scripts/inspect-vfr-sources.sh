#!/usr/bin/env bash
set -euo pipefail

DIR="${1:-local-vfr-source}"

if [[ ! -d "$DIR" ]]; then
  echo "Folder not found: $DIR" >&2
  echo "Usage: bash scripts/inspect-vfr-sources.sh local-vfr-source" >&2
  exit 1
fi

echo "VFR source files in: $DIR"
echo
find "$DIR" -maxdepth 1 -type f | sort | while read -r file; do
  size="$(du -h "$file" | awk '{print $1}')"
  echo "---"
  echo "File: $file"
  echo "Size: $size"
  echo "Type: $(file -b "$file" || true)"

  case "${file,,}" in
    *.tif|*.tiff)
      echo "GDAL summary:"
      gdalinfo "$file" 2>&1 | grep -E "Driver:|Size is|Coordinate System is|Origin =|Pixel Size =|Upper Left|Lower Right" || true
      echo "TIFF read test:"
      if gdalinfo -checksum "$file" >/tmp/vfr-tiff-check.log 2>&1; then
        echo "OK: readable with checksum"
      else
        echo "BAD: checksum/read failed"
        tail -20 /tmp/vfr-tiff-check.log
      fi
      ;;
    *.pdf)
      echo "GDAL PDF summary at default DPI:"
      gdalinfo "$file" 2>&1 | grep -E "Driver:|Size is|Coordinate System is|Origin =|Pixel Size =|Upper Left|Lower Right" || true
      echo "GDAL PDF summary at 300 DPI:"
      gdalinfo --config GDAL_PDF_DPI 300 "$file" 2>&1 | grep -E "Driver:|Size is|Coordinate System is|Origin =|Pixel Size =|Upper Left|Lower Right" || true
      ;;
    *.png|*.jpg|*.jpeg|*.webp)
      echo "Image/GDAL summary:"
      gdalinfo "$file" 2>&1 | grep -E "Driver:|Size is|Coordinate System is|Coordinate System|Origin =|Pixel Size =|Upper Left|Lower Right" || true
      ;;
    *.kmz|*.zip)
      echo "ZIP/KMZ integrity test:"
      python3 - "$file" <<'PY'
import sys, zipfile
path = sys.argv[1]
try:
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        print(f"entries: {len(z.namelist())}")
        print(f"bad member: {bad}")
except Exception as exc:
    print(f"BAD: {type(exc).__name__}: {exc}")
PY
      ;;
  esac

done

echo
echo "Recommended order:"
echo "1) Clean GeoTIFF with checksum OK -> scripts/convert-vfr-chart.sh"
echo "2) High-resolution full-chart PNG -> scripts/convert-vfr-png.sh"
echo "3) GeoPDF -> scripts/convert-vfr-geopdf.sh, but slower"
echo "4) KMZ only as fallback, because corrupted KMZ members cause grey holes"
