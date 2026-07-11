# Tecnam P2006T CS-EAQ performance data

The P2006T runway-performance implementation is aircraft-specific. The first active aircraft is CS-EAQ, serial number 046, in its basic 1180 kg configuration.

## Files

- `src/lib/performance/p2006t-distance-tables.json` stores the transcribed aircraft-specific AFM values and source metadata.
- `src/lib/performance/p2006t-distance.ts` validates the dataset and performs interpolation inside the published table bounds.
- `src/lib/performance/p2006t-cs-eaq-performance.ts` applies the CS-EAQ AFM wind, surface and slope corrections.
- `src/app/performance/p2006t-cs-eaq-client.tsx` provides the operational CS-EAQ workspace on `/performance`.

## Authoritative source

- Aircraft: Tecnam P2006T CS-EAQ
- Serial number: 046
- Document: Aircraft Flight Manual Doc. No. 2006/044
- Edition: 4th Edition, Revision 22
- Date: 11 September 2024
- Configuration: basic 1180 kg MTOW

Increased-MTOW performance pages from Supplement G10 or from another aircraft are intentionally excluded.

## Active distance tables

The verified dataset contains all four required kinds:

- `takeoff-ground-roll`: 1180 kg, Section 5 page 5-7
- `takeoff-50ft`: 1180 kg, Section 5 page 5-7
- `landing-ground-roll`: 930 kg, Section 5 page 5-21
- `landing-50ft`: 930 kg, Section 5 page 5-21

All tables cover:

- pressure altitude from 0 to 10,000 ft;
- OAT values of -25, 0, 25 and 50 °C;
- interpolation only inside those published bounds.

The matrix order remains:

```text
valuesM[weightIndex][pressureAltitudeIndex][oatIndex]
```

The single-item weight axes preserve the exact AFM reference weights. The application does not invent a distance-versus-weight correction.

## Takeoff conditions and corrections

Published conditions:

- Weight: 1180 kg
- Flaps: T/O
- Lift-off speed: 65 KIAS
- Speed over 50 ft: 70 KIAS
- Throttle levers: full forward
- Base runway: grass

Corrections applied by the CS-EAQ calculator:

- headwind: subtract 2.5 m per kt;
- tailwind: add 10 m per kt;
- paved runway: reduce ground roll by 6%;
- uphill slope: add 5% to ground roll per +1% slope.

Wind correction is applied to both ground roll and the 50 ft distance. The paved and slope corrections are applied only to ground roll, matching the wording of the AFM correction block.

## Landing conditions and corrections

Published conditions:

- Weight: 930 kg
- Flaps: LAND
- Short-final approach speed: 70 KIAS
- Throttle levers: idle
- Base runway: grass

Corrections applied by the CS-EAQ calculator:

- headwind: subtract 5 m per kt;
- tailwind: add 11 m per kt;
- paved runway: reduce ground roll by 2%;
- uphill slope: reduce ground roll by 2.5% per +1% slope.

Wind correction is applied to both ground roll and the 50 ft distance. The paved and slope corrections are applied only to ground roll.

## Operational safeguards

- No extrapolation outside the published altitude or temperature grid.
- No downhill-slope credit is applied because the loaded correction only supports the published positive/uphill case.
- Surface and slope default to the selected runway database values and can be overridden visibly by the user.
- Best runway is selected from calculated wind components.
- Corrected 50 ft distances are compared with TODA and LDA and shown with margin and percentage used.
- Raw AFM values remain separate from correction logic to prevent corrections being applied twice.
- The aircraft selector exposes CS-EAQ separately from the existing PA-28/P2008 workspace.

## Adding another P2006T

A later aircraft must receive its own registration/configuration record and approved AFM dataset. Do not reuse CS-EAQ values merely because the aircraft type is the same; applicable supplements, MTOW and aircraft-specific documentation must be checked first.
