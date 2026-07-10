#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:-ANC_Portugal_500k_2022.jpg}"
MIN_ZOOM="${MIN_ZOOM:-6}"
MAX_ZOOM="${MAX_ZOOM:-13}"
WORK_DIR="${WORK_DIR:-data/vfr-chart}"
OUTPUT_DIR="${OUTPUT_DIR:-public/vfr-chart}"
RESAMPLING="${RESAMPLING:-near}"
PROCESSES="${PROCESSES:-4}"

# The full-chart JPG/PNG has the same printed chart extent as the GeoPDF.
# These projected bounds are from the official ANC Portugal 500k GeoPDF/GeoTIFF.
# SRS: ETRS89 / Portugal TM06, EPSG:3763.
SOURCE_SRS="${SOURCE_SRS:-EPSG:3763}"
WEST="${WEST:--175662.48589067}"
NORTH="${NORTH:-295049.675699}"
EAST="${EAST:-174334.904}"
SOUTH="${SOUTH:--504943.091}"

GEOREF_FILE="$WORK_DIR/anc-portugal-500k-georef-from-image.tif"
WARPED_FILE="$WORK_DIR/anc-portugal-500k-3857-from-image.tif"

if ! command -v gdalinfo >/dev/null 2>&1; then
  echo "gdalinfo was not found. Install GDAL first." >&2
  echo "Ubuntu/Codespaces: sudo apt-get update && sudo apt-get install -y gdal-bin" >&2
  exit 1
fi

if ! command -v gdal_translate >/dev/null 2>&1; then
  echo "gdal_translate was not found. Install GDAL first." >&2
  exit 1
fi

if ! command -v gdalwarp >/dev/null 2>&1; then
  echo "gdalwarp was not found. Install GDAL first." >&2
  exit 1
fi

if ! command -v gdal2tiles.py >/dev/null 2>&1; then
  echo "gdal2tiles.py was not found. Install GDAL first." >&2
  exit 1
fi

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Source image not found: $SOURCE_FILE" >&2
  echo "Usage: scripts/convert-vfr-png.sh /path/to/ANC_Portugal_500k_2022.jpg" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

echo "Checking image..."
gdalinfo "$SOURCE_FILE" | head -30

echo "Georeferencing image with ${SOURCE_SRS} projected chart bounds..."
gdal_translate \
  -of GTiff \
  -a_srs "$SOURCE_SRS" \
  -a_ullr "$WEST" "$NORTH" "$EAST" "$SOUTH" \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  -co BIGTIFF=IF_SAFER \
  "$SOURCE_FILE" \
  "$GEOREF_FILE"

echo "Reprojecting image chart to Web Mercator using ${RESAMPLING} resampling..."
gdalwarp \
  -t_srs EPSG:3857 \
  -r "$RESAMPLING" \
  -dstalpha \
  -multi \
  -wo NUM_THREADS=ALL_CPUS \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  -co BIGTIFF=IF_SAFER \
  "$GEOREF_FILE" \
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
echo "NEXT_PUBLIC_VFR_CHART_TILES_URL=/vfr-chart/{z}/{x}/{y}.png"
echo "NEXT_PUBLIC_VFR_CHART_MAX_NATIVE_ZOOM=${MAX_ZOOM}"
