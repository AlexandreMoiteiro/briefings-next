#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:-ANC_Portugal_500k_2022.png}"
MIN_ZOOM="${MIN_ZOOM:-6}"
MAX_ZOOM="${MAX_ZOOM:-13}"
WORK_DIR="${WORK_DIR:-data/vfr-chart}"
OUTPUT_DIR="${OUTPUT_DIR:-public/vfr-chart}"
RESAMPLING="${RESAMPLING:-near}"
PROCESSES="${PROCESSES:-4}"

WEST="-10.25"
NORTH="42.3125"
EAST="-6.00004279020789"
SOUTH="35.124950538548724"

GEOREF_FILE="$WORK_DIR/anc-portugal-500k-georef-from-png.tif"
WARPED_FILE="$WORK_DIR/anc-portugal-500k-3857-from-png.tif"

if [[ ! -f "$SOURCE_FILE" ]]; then
  echo "Source PNG not found: $SOURCE_FILE" >&2
  echo "Usage: scripts/convert-vfr-png.sh /path/to/ANC_Portugal_500k_2022.png" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

echo "Checking PNG..."
gdalinfo "$SOURCE_FILE" | head -20

echo "Georeferencing PNG with full ANC Portugal bounds..."
gdal_translate \
  -of GTiff \
  -a_srs EPSG:4326 \
  -a_ullr "$WEST" "$NORTH" "$EAST" "$SOUTH" \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  -co BIGTIFF=IF_SAFER \
  "$SOURCE_FILE" \
  "$GEOREF_FILE"

echo "Reprojecting PNG chart to Web Mercator..."
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
