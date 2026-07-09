#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${1:-ANC_Portugal_500k_Geospatial_PDF_2022.pdf}"
MIN_ZOOM="${MIN_ZOOM:-6}"
MAX_ZOOM="${MAX_ZOOM:-13}"
WORK_DIR="${WORK_DIR:-data/vfr-chart}"
OUTPUT_DIR="${OUTPUT_DIR:-public/vfr-chart}"
RESAMPLING="${RESAMPLING:-near}"
PROCESSES="${PROCESSES:-4}"
EXTRACTED_FILE="$WORK_DIR/anc-portugal-500k-from-geopdf.tif"
WARPED_FILE="$WORK_DIR/anc-portugal-500k-3857.tif"

if ! command -v gdalinfo >/dev/null 2>&1; then
  echo "gdalinfo was not found. Install GDAL first." >&2
  echo "Ubuntu/Codespaces: sudo apt-get update && sudo apt-get install -y gdal-bin" >&2
  echo "macOS: brew install gdal" >&2
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
  echo "Source GeoPDF not found: $SOURCE_FILE" >&2
  echo "Usage: scripts/convert-vfr-geopdf.sh /path/to/ANC_Portugal_500k_Geospatial_PDF_2022.pdf" >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$WORK_DIR" "$OUTPUT_DIR"

echo "Checking GeoPDF..."
gdalinfo "$SOURCE_FILE" >/dev/null

echo "Extracting GeoPDF raster to GeoTIFF..."
gdal_translate \
  -of GTiff \
  -expand rgba \
  -co TILED=YES \
  -co COMPRESS=DEFLATE \
  -co BIGTIFF=IF_SAFER \
  "$SOURCE_FILE" \
  "$EXTRACTED_FILE"

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
  "$EXTRACTED_FILE" \
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
echo "Remove NEXT_PUBLIC_VFR_CHART_MANIFEST_URL while testing the XYZ tiles."
