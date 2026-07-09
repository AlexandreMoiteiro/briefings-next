# ANC Portugal VFR chart overlay

The `/vfr-map` page can display the ANC Portugal 1:500 000 chart as a raster overlay on top of the base map.

The original chart files should stay out of GitHub because they are large aviation raster assets. Keep them locally or in storage/CDN and serve the web-optimized tiles from there.

## Source files checked

Recommended source when clean: `ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif`.

Useful fallback source: `ANC_Portugal_500k_KMZ_2022_600dpi.kmz`.

The KMZ is a Google Earth SuperOverlay with TIFF image tiles and these approximate coverage bounds:

```txt
North: 42.3125
South: 35.124950538548724
East:  -6.00004279020789
West:  -10.25
```

The app can display either a standard XYZ tile URL or a KMZ-derived image-overlay manifest.

## Runtime configuration

### Preferred: XYZ tiles from a clean GeoTIFF

Add this to `.env.local` for local development or to the Vercel project environment variables for deployment:

```bash
NEXT_PUBLIC_VFR_CHART_TILES_URL=/vfr-chart/{z}/{x}/{y}.png
NEXT_PUBLIC_VFR_CHART_MIN_ZOOM=6
NEXT_PUBLIC_VFR_CHART_MAX_NATIVE_ZOOM=13
NEXT_PUBLIC_VFR_CHART_OPACITY=0.78
NEXT_PUBLIC_VFR_CHART_ATTRIBUTION="ANC Portugal 1:500 000 / NAV Portugal"
```

For externally hosted tiles, use the public URL template instead:

```bash
NEXT_PUBLIC_VFR_CHART_TILES_URL=https://your-storage.example.com/vfr-chart/{z}/{x}/{y}.png
```

### Fallback: PNG overlays from the KMZ

If the GeoTIFF fails `gdalinfo -checksum` with LZW/TIFF read errors, use the KMZ fallback instead:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=/vfr-chart/manifest.json
NEXT_PUBLIC_VFR_CHART_OPACITY=0.78
NEXT_PUBLIC_VFR_CHART_ATTRIBUTION="ANC Portugal 1:500 000 / NAV Portugal"
```

For external hosting:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=https://your-storage.example.com/vfr-chart/manifest.json
```

## Convert the GeoTIFF to XYZ tiles

Install GDAL locally first.

macOS:

```bash
brew install gdal
```

Ubuntu/Debian/Codespaces:

```bash
sudo apt-get update
sudo apt-get install -y gdal-bin
```

Put the GeoTIFF somewhere outside Git or in the project root temporarily, then run:

```bash
chmod +x scripts/convert-vfr-chart.sh
scripts/convert-vfr-chart.sh /path/to/ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif
```

By default the script generates:

```txt
public/vfr-chart/{z}/{x}/{y}.png
```

Then use this locally in `.env.local`:

```bash
NEXT_PUBLIC_VFR_CHART_TILES_URL=/vfr-chart/{z}/{x}/{y}.png
```

## Convert the KMZ fallback to PNG overlays

Put the KMZ somewhere outside Git or in the project root temporarily, then run:

```bash
python3 scripts/convert-vfr-kmz.py /path/to/ANC_Portugal_500k_KMZ_2022_600dpi.kmz
```

By default the script generates:

```txt
public/vfr-chart/manifest.json
public/vfr-chart/images/*.png
```

Then use this locally in `.env.local`:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=/vfr-chart/manifest.json
NEXT_PUBLIC_VFR_CHART_OPACITY=0.78
```

For production, prefer uploading the generated `public/vfr-chart` contents to Supabase Storage, Vercel Blob, S3, Cloudflare R2, or another CDN-backed bucket, then set the matching public URL in Vercel.

## Why not load the TIFF/KMZ directly?

The GeoTIFF and KMZ are around 200 MB each. Loading either directly in the browser would be slow, memory-heavy and fragile. Leaflet is much happier with small map tiles or viewport-limited PNG image overlays.

The uploaded KMZ stores its imagery as TIFF tiles. Browser image layers generally expect PNG, JPEG, WebP or other web-native image formats, so the KMZ is converted into PNG images plus a JSON manifest before runtime.
