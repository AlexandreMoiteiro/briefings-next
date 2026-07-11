# Tecnam P2006T performance data

The P2006T distance engine is intentionally non-operational until the approved AFM/POH data has been entered and independently checked.

## Files

- `src/lib/performance/p2006t-distance-tables.json` stores the transcribed AFM/POH values and source metadata.
- `src/lib/performance/p2006t-distance.ts` validates the dataset and performs interpolation inside the published table bounds.

## Required distance tables

The verified dataset must contain one table for each kind:

- `takeoff-ground-roll`
- `takeoff-50ft`
- `landing-ground-roll`
- `landing-50ft`

Each table uses three ascending axes:

- `weightKg`
- `pressureAltitudeFt`
- `oatC`

The distance matrix order is:

```text
valuesM[weightIndex][pressureAltitudeIndex][oatIndex]
```

Every table must include its exact AFM/POH page in `sourcePage`.

## Safety rules

- Only values transcribed from the approved aircraft AFM/POH may be entered.
- Estimated, internet-sourced or visually guessed values are not acceptable.
- The engine never extrapolates outside the loaded weight, pressure-altitude or temperature range.
- Calculations remain blocked until the dataset status is explicitly changed to `verified`.
- Before operational use, compare representative corner, edge and intermediate cases against the original AFM/POH pages.

## Current state

The dataset is marked `awaiting-afm-data` and contains no operational values. This is deliberate: it preserves the implementation structure without presenting unverified performance figures to the user.
