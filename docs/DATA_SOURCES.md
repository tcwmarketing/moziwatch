# Data sources and licensing

Reviewed 2026-07-14. Production operators must recheck terms before launch and keep source-specific attribution beside displayed data.

| Source                                 | Phase 1 use                                                | Licence and redistribution                                                                                                                                                     | Coverage and updates                                                                    | Missing-data behavior                                                                             |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Protomaps Hosted API and OpenStreetMap | Complete vector basemap                                    | Protomaps hosted usage policy; OpenStreetMap ODbL attribution. Commercial Protomaps API use requires sponsorship.                                                              | Global; Protomaps says hosted tiles update at an irregular, less-than-weekly frequency. | Map shows a configuration notice if a key is absent. No second map provider is used.              |
| Open-Meteo Forecast API                | Daily weather input only, called by the server worker      | Weather data is CC BY 4.0 with attribution. The free endpoint is non-commercial with published request limits. Commercial production requires a paid endpoint or self-hosting. | Canada and US via best-match weather models; model updates vary by provider.            | A missing variable or failed batch fails the forecast run. The last published run remains cached. |
| Camper reports                         | Campground marker ratings and optional future model signal | First-party submissions under site terms.                                                                                                                                      | Campground locations in Canada and the US; immediate after publication.                 | No reports produces a gray marker and a clear empty state.                                        |

## Researched adapters not enabled in Phase 1

These sources are suitable candidates but are not silently substituted for missing production inputs:

- USGS 3DEP elevation: United States, public domain, updated as source projects are acquired.
- Natural Resources Canada HRDEM and CDEM: Canada, Open Government Licence Canada. HRDEM coverage is still expanding and CDEM is an older national archive.
- US Fish and Wildlife Service National Wetlands Inventory: United States, public federal data with irregular updates and known unmapped areas.
- Canadian National Wetlands Inventory: Open Government Licence Canada, updated as needed. The 2025 inventory covered about 33 percent of Canada, so missing polygons do not mean no wetland.
- Annual National Land Cover Database: United States land cover. A production adapter must pin a release and preserve USGS attribution and quality metadata.
- NASA SMAP: soil moisture. A production adapter must select a product, resolution, latency tier, and Earthdata access method before use.
- CDC ArboNET and MosquitoNET: disease and vector surveillance, not general biting nuisance. Passive reporting, provisional data, and local release restrictions make this unsuitable as a direct nuisance label without agreements and epidemiological review.
- Public Health Agency of Canada seasonal mosquito-borne disease surveillance: reports positive mosquito pools and disease activity, not biting nuisance. National presentation is updated during the transmission season, but granular redistribution and comparability require confirmation.

The model infrastructure exposes provider boundaries for weather and environmental features. Wetland, land-cover, elevation, soil-moisture, and official trap-count adapters must be enabled only after their licences, spatial completeness, refresh process, and redistribution terms are approved.

## Campground seed data

`db/seed.ts` contains fictional development records with approximate coordinates. It is labelled `development-only`, must not be treated as a directory, and must never be promoted as licensed production campground data. Administrators can import properly licensed or operator-owned CSV data with a preview and duplicate review.
