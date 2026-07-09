# ANC Portugal VFR chart overlay

The `/vfr-map`, `/navlog` route map, and `/area-map` can display the ANC Portugal 1:500 000 chart as a VFR map source.

The original chart files should stay out of GitHub because they are large aviation raster assets. Keep them locally or in storage/CDN and serve web-optimized tiles from there.

## Recommended approach

Use **XYZ tiles** through `NEXT_PUBLIC_VFR_CHART_TILES_URL` for production. This is faster, sharper, and more reliable than loading a KMZ-derived manifest in the browser.

Recommended sources, in order:

1. `ANC_Portugal_500k_Geospatial_PDF_2022.pdf` converted to XYZ tiles.
2. A clean `ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif` converted to XYZ tiles.
3. `ANC_Portugal_500k_KMZ_2022_600dpi.kmz` converted to a manifest + PNG overlays only as a temporary fallback.

The tested GeoTIFF/KMZ copies had corrupted internal imagery, which causes missing grey blocks at high detail levels. A clean GeoPDF/GeoTIFF converted to XYZ tiles is the real fix.

## Runtime configuration

### Preferred: XYZ tiles

Add this to `.env.local` for local development or to Vercel environment variables for deployment:

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

When using XYZ tiles, leave this empty or remove it:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=
```

### Temporary fallback: PNG overlays from the KMZ

If you only have the KMZ fallback:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=/vfr-chart/manifest.json
NEXT_PUBLIC_VFR_CHART_OPACITY=0.78
NEXT_PUBLIC_VFR_CHART_ATTRIBUTION="ANC Portugal 1:500 000 / NAV Portugal"
```

If high-level KMZ images are corrupted, force a uniform lower level:

```bash
NEXT_PUBLIC_VFR_CHART_MANIFEST_LEVEL=5
```

This avoids mixed levels, but it reduces detail. It is not a long-term replacement for proper XYZ tiles.

## Convert the GeoPDF to XYZ tiles

Install GDAL first.

macOS:

```bash
brew install gdal
```

Ubuntu/Debian/Codespaces:

```bash
sudo apt-get update
sudo apt-get install -y gdal-bin
```

Then run:

```bash
chmod +x scripts/convert-vfr-geopdf.sh
scripts/convert-vfr-geopdf.sh /path/to/ANC_Portugal_500k_Geospatial_PDF_2022.pdf
```

By default this generates:

```txt
public/vfr-chart/{z}/{x}/{y}.png
```

Then use this locally in `.env.local`:

```bash
NEXT_PUBLIC_VFR_CHART_TILES_URL=/vfr-chart/{z}/{x}/{y}.png
NEXT_PUBLIC_VFR_CHART_MANIFEST_URL=
```

## Convert the GeoTIFF to XYZ tiles

If you have a clean GeoTIFF, run:

```bash
chmod +x scripts/convert-vfr-chart.sh
scripts/convert-vfr-chart.sh /path/to/ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif
```

By default this also generates:

```txt
public/vfr-chart/{z}/{x}/{y}.png
```

## Convert the KMZ fallback to PNG overlays

Use this only as a temporary fallback:

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

For production, prefer uploading the generated XYZ tiles to Supabase Storage, Vercel Blob, S3, Cloudflare R2, or another CDN-backed bucket, then set the public URL in Vercel.

## Why not load the TIFF/KMZ directly?

The GeoTIFF and KMZ are around 200 MB each. Loading either directly in the browser is slow, memory-heavy and fragile. Leaflet is faster with small XYZ map tiles that are requested only for the current viewport and zoom.
