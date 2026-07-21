# Data sources and licensing

Reviewed 2026-07-16. Recheck terms before production launch and retain source-specific attribution with displayed or exported data.

## Product and weather

| Source                                  | Use                                                                                      | Licence / operational note                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Protomaps Hosted API and OpenStreetMap  | Complete MapLibre basemap                                                                | Protomaps hosted policy and OpenStreetMap ODbL attribution. Commercial hosted use requires the appropriate Protomaps plan.                   |
| Open-Meteo forecast and historical APIs | Batched 60-day context, hourly activity, seven-day outlook and explicit history backfill | CC BY 4.0 and upstream attribution. The public endpoint is non-commercial with limits; production needs an appropriate plan or self-hosting. |
| Camper reports                          | Observed ratings plus v3 recent/historical evidence                                      | First-party submissions under the site terms. Observed ratings remain separate from model output.                                            |

## Campground locations

| Source                         | Use                                                                             | Licence / coverage                                                   |
| ------------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Overture Places                | Broad US and non-BC Canadian exact-`campground` discovery                       | Overture record-level source licences; release and sources retained. |
| Parks Canada accommodations    | Federal campgrounds outside BC                                                  | Open Government Licence - Canada. Individual pitches consolidated.   |
| Québec tourism syndication     | Registered Québec campgrounds                                                   | CC BY 4.0.                                                           |
| Nova Scotia park entrances     | Provincial camping parks                                                        | Open Government Licence - Nova Scotia.                               |
| RIDB / Recreation.gov          | US federal recreation facilities                                                | RIDB API agreement and required Recreation.gov attribution.          |
| National Park Service API      | NPS campground gap enrichment                                                   | US government data subject to published NPS API terms.               |
| USDA Forest Service ArcGIS     | USFS campground gap enrichment                                                  | U.S. government data and published USDA disclaimer.                  |
| Recreation Sites and Trails BC | BC recreation sites with a positive campsite count                              | Open Government Licence - British Columbia.                          |
| RIDB campsite inventory        | Reservable campsite records grouped by linked U.S. federal facility             | RIDB API Access Agreement; counts can exclude non-reservable sites.  |
| BC Parks Data API              | Provincial parks with active campground operating areas                         | Open Government Licence - British Columbia and published API terms.  |
| GeoNames cities500             | Offline nearest-place and province/state derivation for coordinate-only records | CC BY 4.0; attribution and field provenance retained.                |

## Implemented habitat sources

| Source                                                                                                            | Measurement                                                   | Resolution / period                | Licence and missing-data behavior                                                                                |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| [ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access)                                             | Forest, vegetation and land-cover fractions                   | 10 m                               | CC BY 4.0. A missing tile fails that campground instead of inventing land cover.                                 |
| [JRC Global Surface Water v1.4](https://global-surface-water.appspot.com/download)                                | Seasonal and persistent water, water components and shoreline | 30 m; 1984-2021                    | Copernicus free/open use; attribute `Source: EC JRC/Google`. Open water is never treated as marsh.               |
| [Copernicus DEM GLO-30 Public](https://registry.opendata.aws/copernicus-dem/)                                     | Elevation and slope                                           | 30 m; 2021 release                 | Copernicus DEM public licence. Missing terrain is recorded and lowers confidence.                                |
| [NASA POWER MERRA-2 climatology](https://power.larc.nasa.gov/docs/services/api/temporal/climatology/)             | Consistent long-term rainfall climate                         | 0.5 x 0.625 degrees; 1991-2020     | NASA open-data policy; acknowledge NASA POWER/MERRA-2. Coarse regional context, not a rain gauge.                |
| [Canadian Wetland Inventory Map v3A](https://open.canada.ca/data/en/dataset/87127901-bd6d-46de-9142-e1362d980174) | Canadian bog, fen, swamp and marsh enrichment                 | 10 m                               | Open Government Licence - Canada. Absence is not interpreted as no wetland.                                      |
| [USFWS National Wetlands Inventory](https://www.fws.gov/program/national-wetlands-inventory/web-mapping-services) | US wetland, emergent-marsh, pond and lake enrichment          | Mapped vectors; live REST snapshot | US federal public data. Retain USFWS source and mapping limitations; service updates twice yearly.               |
| [BC Freshwater Atlas](https://catalogue.data.gov.bc.ca/dataset/freshwater-atlas)                                  | BC wetlands, lakes, rivers, stream gradients and shoreline    | Mapped vectors                     | Open Government Licence - British Columbia. Other provinces use the national baseline until an adapter is added. |

`habitat-north-america-v1` preserves source version, resolution, processing time, per-source coverage and known gaps on every profile. Missing polygons never automatically mean habitat absence.

## Supplemental sources

- [HydroLAKES](https://www.hydrosheds.org/products/hydrolakes) is permitted under CC BY 4.0 for QA or regions without better hydrography. The implemented pipeline already separates large water with JRC plus NWI/BC vectors, so it does not repeatedly download the 820 MB global file.
- OpenStreetMap water/wetland features may enrich the profile from a regional PBF. The continental worker does not issue thousands of requests to public Overpass instances.
- USGS 3DEP, NRCan HRDEM/MRDEM and regulatory floodplain layers are appropriate future local enrichments where coverage and redistribution terms are pinned.
- WorldClim is not used because its current general licence restricts commercial use. NASA POWER provides the consistent permitted rainfall baseline.

## Not used as nuisance labels

CDC ArboNET, MosquitoNET and Canadian mosquito-borne disease surveillance concern disease/vector surveillance rather than camper biting nuisance. They are not direct forecast labels. Google Maps, The Dyrt, Campendium, Hipcamp, KOA and other commercial directories are not mined without an explicit licensed feed or written permission.

## OSM location-import policy

OpenStreetMap is used through Protomaps for the basemap, but is not queried or imported as a campground-location source in this phase. The legacy regional-PBF adapter remains dormant for historical reproducibility and is excluded from `locations:import:all`, refresh commands, and schedules.
