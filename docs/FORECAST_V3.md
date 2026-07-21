# Mosquito campground v3

## Status and deployment

`mosquito-campground-v3` is an experimental, deterministic suitability index. It is not machine learning, a mosquito-count estimate, a calibrated probability, a disease model, or an individual-species simulator. Actual camper reports remain the product's primary evidence.

`FORECAST_MODEL_MODE` supports `v2`, `v3-shadow` (default), and `v3`. Shadow mode calculates and stores both models from one weather response, but only v2 has `forecast_runs.is_production=true`. Public queries require that flag. Use `npm run forecast:compare-shadow`; activate v3 only after seasonal review by setting `FORECAST_MODEL_MODE=v3`. Rollback requires only changing it to `v2`.

The frozen v2 artifact is `config/models/v2.json`. V3 values come from `config/models/v3.json` (`mosquito-campground-v3-config-1`) and are expert configuration, not fitted coefficients.

## Environmental formula

All components are clamped 0–1. Displayed risk is 0–100.

```text
environmentalRisk = 100 × (habitatSuitability × breedingCondition
                        × populationPotential × eveningActivity) ^ 0.25
```

The fourth root is the geometric mean of the four normalized factors; it prevents raw multiplication from compressing ordinary values toward zero while remaining fully multiplicative and zero-gated. Wet habitat therefore cannot remain high-risk during freezing, wind or active rain. Wind and rain suppress activity, not stored population potential.

### Static habitat suitability

Coverage rings use 0.58 within 250 m, 0.29 from 250 m–1 km, and 0.13 from 1–3 km. Legacy `from1kmTo5km` JSON is accepted until reprocessed.

| Factor                  | Weight | Treatment                                                                                |
| ----------------------- | -----: | ---------------------------------------------------------------------------------------- |
| Marsh                   |  0.180 | Ring coverage                                                                            |
| Wetland                 |  0.150 | Ring coverage                                                                            |
| Seasonal water          |  0.140 | Ring coverage                                                                            |
| Stagnant/low-flow water |  0.130 | Continuous local potential                                                               |
| Small water bodies      |  0.110 | Continuous density                                                                       |
| Shoreline/water edge    |  0.070 | Edge length saturates at 8 km; shoreline proximity contributes 55%                       |
| Forest/vegetation       |  0.055 | 65% ring forest plus 35% vegetation                                                      |
| Slow river              |  0.035 | Proximity                                                                                |
| Poor drainage           |  0.035 | `1 - drainagePotential`                                                                  |
| Land cover              |  0.025 | Wetland 1; forest .70; grass/agriculture .42; developed .16; barren/ice .04; unknown .32 |
| Floodplain              |  0.025 | Exposure when available                                                                  |
| Fast river              |  0.005 | Proximity is reduced to 25% first                                                        |
| Large open water        |  0.005 | Surface coverage is reduced to 12% first                                                 |

Large-lake surface is not breeding habitat. Shoreline, shallow edge, marsh and adjacent wetland carry the useful signal. Offline processing must de-duplicate overlapping features before normalization.

Profiles store source name, version, resolution, processing time and coverage in `data_coverage`, plus `source_provenance`. Missing sources reduce `dataCoverage.overall` and confidence rather than being interpreted as confirmed absence.

The daily worker batches ten coordinates and splits provider retrieval by purpose. The Open-Meteo Historical Weather API returns the preceding 60 days of daily temperature, precipitation, rain, snowfall and ET0 plus hourly shallow-soil moisture and snow depth. The Forecast API returns 16 daily forecast values while `forecast_hours=192` limits the full hourly activity variables to the next eight days. The two time series are de-duplicated by timestamp before scoring. This preserves the breeding-history inputs without requesting ten hourly activity variables for all 60 historical days.

### Persistent breeding water

The previous 60 days are processed in order. `wetHabitat` is the maximum of wetland, marsh, seasonal-water and stagnant-water factors.

```text
capacity = clamp(0.35 + 0.65 × wetHabitat)
initialWater = min(capacity, wetHabitat × 0.35)
snowmeltMm = max(0, previousSnowDepthM - currentSnowDepthM) × 1000
gain = 0.025 × precipitationMm + 0.03 × snowmeltMm
loss = (0.01 + 0.015 × ET0mm + 0.025 × drainagePotential
              + 0.001 × slopeDegrees) × (1 - 0.55 × wetHabitat)
water[t] = clamp(water[t-1] + gain - loss, 0, capacity)
```

At 55 mm daily rain, flushing subtracts `0.08 × (0.5 + 0.5 × fastRiverProximity)`.

Rain windows remain separate. The lag score is:

```text
clamp((.08 × rain0to2 + .22 × rain3to7
     + .46 × rain8to14 + .24 × rain15to30) / 35)
```

Rain frequency is the previous-30-day fraction with at least 1 mm. Seven-day mean shallow soil moisture scales from 0 at .07 to 1 at .36.

```text
breedingCondition = .55 × water + .15 × rainFrequency
                  + .20 × soilMoisture + .10 × rainfallLag
```

### Population potential

Thirty-day development starts at 10°C, reaches full daily suitability at 25°C, and is heat-reduced above 35°C. Suitable degree-days saturate at 180. Survival multiplies by `exp(-.38 × freezeDays)`, `exp(-.035 × nightsBelow6C)`, and `exp(-.05 × daysAbove35C)`. Day length scales from 8–15 hours and contributes 32% of the seasonal multiplier. Falling snow depth can add up to .12 during the active day-length season.

### Hourly activity

- Temperature is zero at/below 5°C, rises to 1 at 24°C, and falls to zero at 38°C.
- Relative humidity is v3's only moisture reward and scales from 35–85%. Dew point remains requested only for frozen v2.
- Wind suppression starts at 8 km/h and reaches 90% at 25 km/h.
- Gust suppression starts at 20 km/h and reaches 75% at 45 km/h.
- Rain suppression starts at .5 mm/hour and reaches 90% at 4 mm/hour.
- Daylight multiplies by .65; nighttime by 1.

Hourly activity is the product. Evening activity is the local 17:00–23:59 mean; daily peak is the maximum hour. Eight results cover tonight plus seven days.

## Report evidence

Ratings map to 0, 25, 50, 75 and 100. Only valid, published, non-deleted exact-campground reports submitted before generation are eligible. Duplicate attempts are rejected by the existing advisory-lock policy.

Reports store observation date but not time. V3 uses submission time as a fallback for time relevance and applies a .85 missing-time multiplier.

### Recent

Recency multipliers are 1 through 24 hours, .85 through 3 days, .60 through 7, .35 through 14, .15 through 30, then zero. Verified accounts multiply by 1; anonymous/unverified by .70. Weight is recency × reporter × time quality.

The signal is a weighted median. Effective sample size is `(sum weights)^2 / sum(weight^2)`. Agreement is `clamp(1 - weightedStandardDeviation / 50)`.

```text
recentConfidence = (1 - exp(-effectiveSampleSize / 3))
                 × agreement × weightedReporterQuality × .85
```

### Historical seasonal

Only previous years within ±21 calendar days are eligible; recent IDs are excluded. Weight is `.85^yearsOld × seasonalProximity × reporterMultiplier`. Three reports across two years are required before confidence becomes non-zero.

```text
historicalConfidence = (1 - exp(-effectiveSampleSize / 10))
                     × (1 - exp(-representedYears / 2)) × agreement
```

## Dynamic blending

```text
recentWeight = horizonRecentMaximum × recentConfidence
historicalWeight = .25 × historicalConfidence
environmentalWeight = 1 - recentWeight - historicalWeight
finalRisk = environmentalRisk × environmentalWeight
          + recentSignal × recentWeight
          + historicalSignal × historicalWeight
```

Tonight/tomorrow use recent maximum .50 and environmental minimum .25. Days 2–3 use .35/.40. Days 4–7 use .20/.55. Excess evidence weight is proportionally reduced. Missing signals get zero weight.

Provisional levels: 0–15 none/minimal; >15–35 light; >35–55 moderate; >55–75 heavy; >75–100 severe. Gray means unavailable, never no mosquitoes.

## Confidence

Confidence is evidence quality, not probability of correctness.

```text
base = .35 × weatherCompleteness + .30 × habitatCoverage
     + .35 × agreement(environmental, recent, historical)
confidence = base × (1 - .045 × min(forecastDay, 7))
```

Low is below .45, medium .45–.719, high at least .72. Reasons explain missing/inconsistent reports, directional adjustments, seasonal support and incomplete habitat.

## Weather, storage and API

The worker batches up to 100 coordinates and shares one response between v2 and shadow v3. Daily/priority campgrounds use their exact coordinates. Weekly/minor campgrounds reuse a nearby configurable regional weather cell during large backfills; each campground still uses its own habitat profile and report evidence, regional-weather forecasts receive a completeness penalty, and the explanation identifies the approximation. It requests 60 past and 16 forecast days for rollover-safe derivation, then publishes the eight-night product horizon for both models using local time and land-cell selection. Daily variables: mean/min/max temperature, relative humidity, dew point (v2), precipitation, rain, snowfall, ET0, wind, sunrise and sunset. Hourly: temperature, relative humidity, precipitation, rain, snowfall, snow depth, shallow soil moisture, wind, gusts and daylight state.

If the live provider exhausts its retry budget, a weekly/minor site may reuse weather fetched earlier in the same forecast run from the nearest completed campground, up to 500 km away. An exact daily target can use this emergency fallback only within 100 km. Completeness decreases continuously with distance and is at most 45% at the weekly distance limit after the regional penalty. Habitat, report evidence and final scoring remain campground-specific. More distant sites stay pending rather than receiving a cross-continent estimate.

`weather_observations` stores one shared raw and normalized weather input per exact or regional weather target. `campground_weather_history_daily` is retained for explicit historical backfills rather than duplicated during every daily run. `campground_forecast_evidence` stores config/profile provenance, weather run, environmental result, included report IDs/weights, historical result, blend weights, final result and confidence reasons. These are server-only RLS-protected tables.

`GET /api/campgrounds/:id/forecast` returns the production model and keeps forecast, observed 30-day rating and observed historical rating separate.

## Commands

```text
HABITAT_INPUT_PATH=/secure/path/profiles.json npm run habitat:publish
WEATHER_HISTORY_START=2026-05-01 WEATHER_HISTORY_END=2026-07-14 npm run forecast:backfill-weather
npm run forecast:run
npm run forecast:compare-shadow
```

Habitat input is produced offline from permitted data and includes continuous 250 m, 250 m–1 km and 1–3 km metrics plus coverage metadata. No web or daily request downloads continent-scale GIS files.

## Limitations and coverage

- All 1,411 major campgrounds (at least 50 documented campsites) have the detailed `habitat-north-america-v1` profile. Verified minor campgrounds use the separate `habitat-minor-fast-v1` 30 m / 3 km continental profile so daily visitor requests never perform GIS work.
- ESA WorldCover and JRC Global Surface Water provide the consistent land-cover/water baseline, Copernicus GLO-30 supplies elevation and slope, and NASA POWER supplies the rainfall climate normal. NWI, CWIM3A and BC Freshwater Atlas enrich supported areas. A failed enrichment retains the continental inputs, records the coverage gap and lowers confidence instead of discarding the profile.
- Open-Meteo grid weather can miss campground microclimates; archive and live forecast products differ.
- Observation time is absent, so time matching is reduced-confidence.
- Email verification is not field-observation verification.
- All thresholds are provisional. Review seasonal shadow residuals before activation.
