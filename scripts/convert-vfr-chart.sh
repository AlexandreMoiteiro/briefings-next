#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:-ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif}"
MIN_ZOOM="${MIN_ZOOM:-6}"
MAX_ZOOM="${MAX_ZOOM:-13}"
WORK_DIR="${WORK_DIR:-data/vfr-chart}"
OUTPUT_DIR="${OUTPUT_DIR:-public/vfr-chart}"
RESAMPLING="${RESAMPLING:-near}"
PROCESSES="${PROCESSES:-4}"
WARPED_FILE="$WORK_DIR/anc-portugal-500k-3857.tif"

if ! command -v gdalinfo >/dev/null 2>&1; then
  echo "gdalinfo was not found. Install GDAL first." >&2
  echo "macOS:  brew install gdal" >&2
  echo "Ubuntu: sudo apt-get install gdal-bin" >&2
  exit 1
fi

if ! command -v gdalwarp >/dev/null 2>&1; then
  echo "gdalwarp was not found. Install GDAL first." >&2
  echo "macOS:  brew install gdal" >&2
  echo "Ubuntu: sudo apt-get install gdal-bin" >&2
  exit 1
fi

if ! command -v gdal2tiles.py >/dev/null 2>&1; then
  echo "gdal2tiles.py was not found. Install GDAL first." >&2
  echo "macOS:  brew install gdal" >&2
  echo "Ubuntu: sudo apt-get install gdal-bin" >&2
  exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Source file not found: $SOURCE_FILE" >&2
  echo "Usage: scripts/convert-vfr-chart.sh /path/to/ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif" >&2
  exit 1
fi

echo "Checking source file..."
if ! gdalinfo -checksum "$SOURCE_FILE" >/dev/null; then
  echo "GDAL reported read errors while checking the source file." >&2
  echo "The GeoTIFF may be incomplete/corrupted. Re-upload or re-download the source if the generated chart has gaps." >&2
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

echo "Reprojecting chart to Web Mercator using ${RESAMPLING} resampling..."
gdalwarp \
  -t_srs EPSG:3857 \
  -r "$RESAMPLING" \
  -dstalpha \
  -multi \
  -wo NUM_THREADS=ALL_CPUS \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  -co BIGTIFF=IF_SAFER \
  "$SOURCE_FILE" \
  "$WARPED_FILE"

echo "Generating XYZ tiles z${MIN_ZOOM}-${MAX_ZOOM}..."
gdal2tiles.py \
  --xyz \
  -p mercator \
  -r "$RESAMPLING" \
  -z "${MIN_ZOOM}-${MAX_ZOOM}" \
  --processes="$PROCESSES" \
  "$WARPED_FILE" \
  "$OUTPUT_DIR"

echo "Done. Tiles are in: $OUTPUT_DIR"
echo "Use this locally in .env.local:"
echo "NEXT_PUBLIC_VFR_CHART_TILES_URL=/vfr-chart/{z}/{x}/{y}.png"
