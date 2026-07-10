# ANC Portugal VFR chart

The `/vfr-map`, `/navlog` route map, `/area-map`, and the NavLog route-map PDF use the ANC Portugal 1:500 000 chart as a local XYZ tile source.

The application always reads:

```txt
/vfr-chart/{z}/{x}/{y}.png
```

No Supabase Storage bucket, external CDN, or tile URL environment variable is required.

## Repository layout

The generated chart contains 6,745 PNG tiles for zoom levels 6 through 12. To avoid committing thousands of loose files, the tiles are stored as 105 small split archive parts:

```txt
data/vfr-chart-bundle/vfr-chart.tar.gz.part-00
data/vfr-chart-bundle/vfr-chart.tar.gz.part-01
...
```

Before `next dev` and `next build`, `scripts/prepare-vfr-chart.mjs` automatically:

1. joins the archive parts in their sorted order;
2. extracts the tiles into `public/vfr-chart`;
3. verifies a known z6 tile;
4. removes the temporary archive.

The generated `public/vfr-chart` directory remains ignored by Git because it can always be reconstructed from the committed bundle.

## Source and repair record

Source supplied for this build:

```txt
ANC_Portugal_500k_GeoTIFF_600dpi_2022(2).tif
```

Source properties:

- Dimensions: 16,535 × 37,795 pixels
- Projection: Lambert Conformal Conic, WGS 84
- Source resolution: approximately 21.17 metres per pixel
- Source size: 203,556,231 bytes
- Generated maximum native zoom: 12

The source TIFF contained four damaged LZW strips:

```txt
rows 5592-5599
rows 5608-5615
rows 5616-5623
rows 6416-6423
```

This represents 32 of 37,795 rows, or approximately 0.085% of the raster. The damaged rows were reconstructed from the nearest valid rows above and below before reprojection. The repaired areas were visually checked at z12 around 41.25837°N / 8.14109°W and 41.10130°N / 8.14107°W.

The original 203 MB GeoTIFF is not committed because normal GitHub repositories reject individual files over 100 MB. Only the web-ready derivative is stored in the repository.

## Regenerating from a clean GeoTIFF

Keep a clean GeoTIFF as the preferred master source. With GDAL installed:

```bash
chmod +x scripts/convert-vfr-chart.sh
MAX_ZOOM=12 scripts/convert-vfr-chart.sh /path/to/ANC_Portugal_500k_GeoTIFF_600dpi_2022.tif
```

The conversion output is:

```txt
public/vfr-chart/{z}/{x}/{y}.png
```

After inspecting the output, rebuild the split repository bundle before committing it. Do not commit the original TIFF or the unpacked `public/vfr-chart` directory.

## Runtime configuration

The URL is fixed in the map components. These optional values remain configurable:

```bash
NEXT_PUBLIC_VFR_CHART_MIN_ZOOM=6
NEXT_PUBLIC_VFR_CHART_MAX_NATIVE_ZOOM=12
NEXT_PUBLIC_VFR_CHART_OPACITY=0.78
NEXT_PUBLIC_VFR_CHART_ATTRIBUTION="ANC Portugal 1:500 000 / NAV Portugal"
```

The legacy KMZ manifest variables remain available only as a development fallback. The bundled XYZ source takes precedence.

## Why the TIFF is not loaded directly

The TIFF is a 203 MB geospatial source file in a Lambert projection. Loading it directly in the browser would be slow and memory-heavy, and Leaflet expects web map tiles. The prepared XYZ tiles allow the browser to request only the current viewport and zoom level, while Vercel serves them as static cached assets.
