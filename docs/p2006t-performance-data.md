# Tecnam P2006T performance data

The P2006T distance engine is intentionally non-operational until the approved AFM/POH data has been entered and independently checked.

## Files

- `src/lib/performance/p2006t-distance-tables.json` stores the transcribed AFM/POH values and source metadata.
- `src/lib/performance/p2006t-distance.ts` validates the dataset and performs interpolation inside the published table bounds.

## Authoritative source

The current transcription is based on the aircraft-specific manual:

- Aircraft: Tecnam P2006T CS-EAQ, serial number 046
- Document: Aircraft Flight Manual Doc. No. 2006/044
- Edition: 4th Edition, Revision 22
- Date: 11 September 2024

The dataset must not combine the CS-EAQ basic 1180 kg performance pages with increased-MTOW supplement tables from another aircraft configuration.

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
- Do not apply corrections twice: the raw table values and all wind, surface and slope corrections must remain distinguishable.

## Current coverage

The dataset is marked `draft` and contains the grass-runway takeoff ground-roll values for 1180 kg from Section 5, page 5-7, over the published pressure-altitude and OAT grid.

The source page specifies:

- Flaps T/O
- Lift-off speed 65 KIAS
- Throttle levers full forward
- Headwind correction: subtract 2.5 m per kt
- Tailwind correction: add 10 m per kt
- Paved-runway correction: reduce ground roll by 6%
- Uphill-slope correction: add 5% to ground roll per +1% slope

Those corrections are recorded in the table notes but are not yet applied by the calculation engine.

Still required before activation:

- independent visual verification of every transcribed ground-roll cell;
- takeoff distance over 50 ft;
- landing ground roll;
- landing distance over 50 ft;
- correction-engine implementation and tests;
- confirmation of the applicable aircraft configuration and weight pages;
- final status change from `draft` to `verified`.
