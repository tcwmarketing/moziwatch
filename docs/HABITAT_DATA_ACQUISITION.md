# North American habitat processing

## Two-tier production pass

Major campgrounds use the detailed `habitat-north-america-v1` processor with
10 m local grids and available national or provincial enrichment. Verified
minor campgrounds use `habitat-minor-fast-v1`, a 30 m / 3 km continental
baseline that records the deferred enrichment and reduces confidence.

The current production set contains 1,411 detailed major profiles and 18,395
simplified verified-minor profiles. Closed and unverified location records are
not included in the minor coverage total.

```bash
npm run habitat:export-major
python worker/habitat/process-north-america.py --input data/habitat/major-campgrounds-detailed.json --only-version-missing --limit 25 --output data/habitat/batches/major-detailed.json
npm run habitat:publish -- data/habitat/batches/major-detailed.json

npm run habitat:export-minor
python worker/habitat/process-north-america.py --minor-fast --input data/habitat/minor-campgrounds.json --only-version-missing --limit 250 --output data/habitat/batches/minor-simplified.json
npm run habitat:publish -- data/habitat/batches/minor-simplified.json

npm run habitat:verify -- --major-only --version habitat-north-america-v1
npm run habitat:verify -- --minor-only --version habitat-minor-fast-v1
```

The scheduled workflow runs bounded, version-aware batches for both tiers: 25
detailed major profiles and 250 simplified minor profiles per run. It skips a
campground only when that exact profile version is already stored. Static
profiles are versioned and cached; the daily forecast never reprocesses GIS
data. Offline output is atomically checkpointed every 25 locations by default,
which keeps large batches resumable without rewriting the growing artifact for
every campground.

If an individual raster tile or enrichment service is unavailable, processing
continues with the remaining permitted sources. The missing measurement is
recorded as a coverage gap and lowers `profileConfidence`; it is never silently
treated as measured habitat.

MoziWatch calculates static habitat profiles offline for every active campground
in Canada and the United States. A visitor request never downloads or processes
GIS data. Bear Creek is a validation location, not a separate implementation.

## Implemented source stack

The shared continental baseline is:

| Source                        | Measurement                                      | Resolution          | Licence                                   |
| ----------------------------- | ------------------------------------------------ | ------------------- | ----------------------------------------- |
| ESA WorldCover 2021 v200      | Forest, vegetation and land-cover class          | 10 m                | CC BY 4.0                                 |
| JRC Global Surface Water v1.4 | Seasonal and persistent surface water, 1984-2021 | 30 m                | Copernicus free/open use with attribution |
| Copernicus DEM GLO-30 Public  | Elevation and terrain slope                      | 30 m                | Copernicus DEM public licence             |
| NASA POWER / MERRA-2          | 1991-2020 monthly and annual rainfall climate    | 0.5 x 0.625 degrees | NASA open data; acknowledge NASA POWER    |

Country and provincial enrichments are:

- Canada: Canadian Wetland Inventory Map v3A (CWIM3A), 10 m, Open Government Licence - Canada.
- British Columbia: Freshwater Atlas wetland, lake, river and stream WFS layers, Open Government Licence - British Columbia.
- United States: US Fish and Wildlife Service National Wetlands Inventory REST features and Cowardin attributes. The service is updated twice yearly.

The pipeline can therefore process every US and Canadian coordinate even when a province-specific adapter is not available. Missing enrichment is recorded on that profile and reduces confidence. It never means that no wetland exists.

HydroLAKES remains a permitted optional QA source for lakes of at least 10 ha. The current processor derives large-water polygons and shoreline from JRC and uses the finer BC Freshwater Atlas or NWI polygons where available. OpenStreetMap remains the location/geometry baseline and may be added from a regional PBF for supplementary water tags; the public Overpass service is not queried thousands of times during a continental run.

## Measurements and precedence

Each campground is analysed on a local azimuthal-equidistant 10 m grid with non-overlapping rings: 0-250 m, 250 m-1 km, 1-3 km, and 1-5 km (retained for frozen v2 compatibility).

The normalized geometry precedence is marsh, other wetland, seasonal water, small permanent water, river, large open water, then other land cover. Marsh is removed from other wetland, and both are removed from seasonal water. This prevents one pixel being counted three times.

Large open water is never scored as marsh. It is retained separately as large-open-water coverage inside 1 km, distance-decayed shoreline proximity, and shoreline length inside 1 km.

Water components under 10 ha become the small-water count. The normalized density is `1 - exp(-count / 5)`. In BC, stream gradient is used to keep fast streams (`>= 0.015 m/m`) separate from slow streams (`<= 0.005 m/m`). Unknown stream speed is left unclassified.

All derived formulas and raw distances/counts are written to `source_provenance`. Source version, resolution, processing time and coverage are written to `data_coverage`.

## Local commands

Create a Python virtual environment and install the pinned GIS dependencies:

```powershell
python -m venv .venv-habitat
.\.venv-habitat\Scripts\Activate.ps1
python -m pip install -r requirements-habitat.txt
```

Export active database locations, process a safe batch, publish it and verify coverage:

```powershell
npm run habitat:export
npm run habitat:process -- --only-unprofiled --limit 25 --output data/habitat/batches/north-america-v1.json
npm run habitat:publish -- data/habitat/batches/north-america-v1.json
npm run habitat:verify
```

Use `--limit 0` for every matching campground. Long jobs write the output after each campground. Add `--resume` to continue an interrupted output file without repeating completed locations. Other useful selectors are `--country CA`, `--country US`, `--slug bear-creek-park`, and `--start-after <slug>`.

`habitat:publish` deactivates the previous active profile but retains every old row and version for reproduction. The new version is `habitat-north-america-v1` with `dataKind=measured-geospatial`.

## Scheduled backfill

`.github/workflows/habitat-backfill.yml` runs a bounded batch before the daily forecast workflow. It exports active locations, processes up to 100 locations that lack a measured profile, caches permitted vector/API responses, publishes successful profiles, and prints coverage by country and region. At the current directory size, the initial backfill is therefore spread over roughly thirteen daily runs rather than one fragile multi-hour transaction.

The workflow needs only the existing `DATABASE_URL` repository secret. Public GIS sources do not require API keys. A manual workflow run can refresh existing profiles or begin after a slug cursor. Static profiles are not recalculated in the daily weather job.

## Coverage and limitations

- The current campground directory is concentrated in British Columbia. The code path is also integration-tested with contrasting Florida and Arizona locations so US NWI and continental raster tiling are exercised before US locations are imported.
- CWIM3A and NWI are mapped products with their own omissions. Source absence is not habitat absence.
- Province-specific enrichment is implemented for BC. Other Canadian provinces use the national baseline until a permitted adapter is added.
- US fast/slow stream classification remains neutral until a national hydrography-line adapter is pinned. The gap is retained per US profile.
- The floodplain field is explicitly a drainage/water-proximity proxy, not a regulatory floodplain map.
- NASA POWER rainfall is deliberately consistent across North America but is coarse. It is long-term context, not a campground rain gauge.
- Copernicus GLO-30 is a surface model, so buildings and tree canopy can affect elevation locally.

Run `npm run habitat:verify -- --require-complete` in a release gate when every active US/Canadian campground must have the current measured version.
