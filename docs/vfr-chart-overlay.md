# ANC Portugal VFR chart overlay

The `/vfr-map` page can display the ANC Portugal 1:500 000 chart as a raster overlay on top of the base map.

The original chart files should stay out of GitHub because they are large aviation raster assets. Keep them locally or in storage/CDN and serve the web-optimized tiles from there.

## Source files checked

Recommended source: `ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif`.

Useful validation source: `ANC_Portugal_500k_KMZ_2022_600dpi.kmz`.

The KMZ is a Google Earth SuperOverlay with TIFF image tiles and these approximate coverage bounds:

```txt
North: 42.3125
South: 35.124950538548724
East:  -6.00004279020789
West:  -10.25
```

The app uses those bounds when drawing the tile layer so Leaflet will not request the chart far outside mainland Portugal / the chart coverage area.

## Runtime configuration

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

## Convert the GeoTIFF to XYZ tiles

Install GDAL locally first.

macOS:

```bash
brew install gdal
```

Ubuntu/Debian:

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

For production, prefer uploading the generated `public/vfr-chart` contents to Supabase Storage, Vercel Blob, S3, Cloudflare R2, or another CDN-backed bucket, then set `NEXT_PUBLIC_VFR_CHART_TILES_URL` to that public URL template.

## Why not load the TIFF/KMZ directly?

The GeoTIFF and KMZ are around 200 MB each. Loading either directly in the browser would be slow, memory-heavy and fragile. Leaflet is much happier with small map tiles that are requested only for the current viewport and zoom.

The uploaded KMZ also stores its imagery as TIFF tiles. Browser image layers generally expect PNG, JPEG, WebP or other web-native image formats, so the KMZ is useful for validation but not ideal as the direct runtime asset.
