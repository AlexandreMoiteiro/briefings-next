# Tecnam P2006T guided performance workflow

The P2006T implementation is aircraft-specific and validation-first. No operational dataset is activated merely because another aircraft of the same type has similar pages.

## Aircraft selector

`/performance` exposes one visible selector with three aircraft types:

- Tecnam P2006T — default when the page opens;
- Tecnam P2008;
- Piper PA-28.

The P2006T workspace then selects one of the currently configured registrations:

- CS-EAQ, S/N 046, build year 2010;
- CS-EBX, S/N 184, build year 2016;
- D-GSEV, S/N 290, build year 2019.

All P2006T operational calculations assume a paved runway. The source AFM table remains stored as published and the paved-runway correction remains a separate, visible calculation step.

## Visual source mapper

The Admin route `/admin/p2006-performance` begins with a visual mapper before the editable data builder.

### AFM table mode

For each aircraft and performance table, the mapper displays:

- the original AFM page on the left;
- the currently stored table values on the right;
- the aircraft registration, table type and source PDF page;
- automatic probing of common `public/p2006-performance-pages` paths;
- an exact public-path override;
- a local real-image loader when the repository path still needs to be confirmed.

The image must genuinely load before coordinate marking is enabled. A missing asset is shown as missing; the builder never substitutes a fabricated performance page.

### PDF template mode

Both rendered pages of `RVP.CFI.071.02 Tecnam P2006T M&B and Performance Data Sheet` are embedded in the builder:

- page 1: loading table and graphical mass-and-balance worksheet;
- page 2: airfield, performance and fuel-planning tables.

The builder can recreate a two-page A4 PDF from those embedded pages for mapping and testing.

### Coordinate modes

The same tool can mark:

- a point;
- a rectangle around a table cell or PDF field;
- a multi-point polyline representing a graphical calculation path.

Coordinates are stored in normalized image space:

```text
x: 0 at left, 1 at right
y: 0 at top, 1 at bottom
```

For the two A4 form pages, the exported JSON also contains PDF points using a bottom-left origin and a `595.28 × 841.89 pt` page size. This allows the final PDF generator to reproduce the marks without recalibrating for browser display size.

Coordinate maps can be saved in browser storage and exported as JSON.

## Guided table builder

Below the mapper, the existing guided builder covers four tables:

1. takeoff ground roll;
2. takeoff distance over 50 ft;
3. landing ground roll;
4. landing distance over 50 ft.

For each registration and table, it provides:

- editable source-page reference;
- editable public image and text paths;
- editable extracted source text;
- editable pressure-altitude/OAT table cells;
- a review checkbox available only when every cell is populated;
- local browser draft storage;
- downloadable review JSON.

The builder does not write `verified` automatically. Repository data must only be promoted after the user has checked all source values and calculation rules.

## Calculation trace

The builder highlights the four cells used for a requested pressure altitude and OAT. It then displays:

1. the lower and upper pressure-altitude rows;
2. the lower and upper OAT columns;
3. the four source values;
4. interpolation along OAT on each altitude row;
5. interpolation between the two altitude results;
6. wind correction;
7. paved-runway correction;
8. uphill-slope correction;
9. final rounded distance.

The correction coefficients remain editable during validation so transcription or interpretation errors can be corrected before approval.

## Operational blocking

`src/lib/performance/p2006t-distance-tables.json` is currently marked `draft`.

- No extrapolation is permitted outside the published axes.
- The operational P2006T page blocks calculated output while the selected aircraft is not verified.
- CS-EBX and D-GSEV do not inherit CS-EAQ values.
- Increased-MTOW supplements are not mixed into a basic-aircraft dataset without an aircraft-specific applicability check.

## Current CS-EAQ draft

The current CS-EAQ draft contains four transcribed tables pending guided confirmation:

- takeoff ground roll, 1180 kg, Section 5 page 5-7;
- takeoff over 50 ft, 1180 kg, Section 5 page 5-7;
- landing ground roll, 930 kg, Section 5 page 5-21;
- landing over 50 ft, 930 kg, Section 5 page 5-21.

The values remain review data, not an approved operational dataset.

## Final PDF workflow

The intended export package is:

1. completed two-page M&B and Performance Data Sheet;
2. original source performance page for each calculation;
3. the source cells or graphical points visibly marked;
4. calculation sheet showing pressure altitude, density altitude, interpolation, wind, paved-runway and slope steps;
5. final comparison of TODR with TODA and LDR with LDA.

The PDF mapping builder and final exporter must use the same reviewed data, coordinate maps and calculation-trace objects. They must not contain a second independent calculation implementation.
