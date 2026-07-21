# Campground coverage gaps

No implemented source is complete, and combining them does not guarantee complete North American coverage.

## Current expected coverage

- Overture Places is the broad discovery baseline for Canada and the United States. Only the exact primary `campground` category is retained. The public subset is further limited by the versioned established-campground publication rule; weaker and ambiguous records remain staged.
- OpenStreetMap can supplement a worker-supplied regional extract. Completeness and tagging quality vary by community and region. Unnamed or weakly identified features are intentionally skipped.
- RIDB covers many United States federal recreation facilities, not all public, state, municipal, tribal, or private campgrounds.
- NPS enriches campgrounds managed by the United States National Park Service. It substantially overlaps RIDB and OSM.
- Recreation Sites and Trails BC covers relevant British Columbia recreation projects with a positive campsite count. The BC Parks connector adds provincial parks with active campground operating sub-areas. These sources still do not cover national parks, private RV parks, or every backcountry campsite.
- Parks Canada, Québec tourism, Nova Scotia Parks, BC Parks, Recreation Sites and Trails BC, RIDB, NPS, and USFS provide authoritative enrichment in their respective scopes.
- Moderated user suggestions identify remaining gaps but do not publish automatically.

## Systematic gap filling

Do not patch individual cities by manually adding nearby search results. The monthly refresh now runs `npm run locations:audit-coverage` after imports and verification. The audit uses GeoNames cities500 as an independent denominator and checks every Canadian and US populated place with at least 10,000 residents. It also detects rural half-degree cells containing three or more high-confidence staged Overture campground records with no published campground within 50 km.

Populated-place thresholds are intentionally travel-oriented: 35 km for populations of 250,000 or more, 45 km for 100,000 or more, 60 km for 25,000 or more, and 75 km for 10,000 or more. Nearby suburbs within 30 km are collapsed so the review list identifies regions instead of repeating one metropolitan gap. A `publication_gap` has credible staged records that need verification; a `source_gap` has no such record and needs an additional permitted source. The latest 250 representative gaps are stored in the import-run checkpoint and displayed to administrators.

After each monthly Overture refresh, the nationwide `overture-established-campground-v2` verifier publishes only explicit established campground names with strong source confidence and holds likely duplicates back. This turns already-imported records into map coverage without reintroducing camps, schools, shops, ranger stations, conference facilities, or the discarded low-confidence tail.

Measure results by jurisdiction and inspect population centres that have no public campground within a practical travel radius. A gap may be real: for example, the closest established campgrounds to a small town can legitimately be tens of kilometres away. Add official state, provincial, municipal, or tribal connectors only when the endpoint distinguishes overnight camping from ordinary parks and its reuse terms permit publication.

## Sources not imported

Reservation websites are not scraped. An official Alberta protected-area boundary or general parks feed is not sufficient because it does not establish that every feature has an overnight campground. Alberta campground coverage currently combines Parks Canada and the conservative Overture public subset while a reusable, campground-specific provincial feed is researched.

Texas Parks and Wildlife is not required as the core Texas source. It would only be an authoritative state-park enrichment source, and its published website copyright policy requires permission for commercial reuse. Do not activate it as an automated source until the intended use is confirmed as permitted.

Texas already has three broader source paths: RIDB and USFS for federal facilities, Overture for broad campground discovery, and OpenStreetMap for permitted ODbL coverage of private, municipal, state and other established campgrounds. RIDB cannot fill state, county, city or most private-campground gaps because its scope is federal recreation. The existing OSM connector accepts a worker-supplied Geofabrik extract and imports named `tourism=camp_site` and `tourism=caravan_site` features. County and municipal open-data feeds may enrich a specific source gap when their reuse terms are clear; they are too fragmented to serve as the nationwide denominator.

The ranked gap filler runs with `npm run locations:fill-gaps:osm`. It queries only audited gap regions through Overpass, stores results in the normal source pipeline, matches duplicates, and publishes only developed campgrounds or RV parks with independent-source corroboration or additional establishment evidence such as an operator, website, address, phone or campsite capacity. Private-access, youth/scout, retreat, school and similarly excluded facilities remain unpublished. Monthly/full refreshes run this pass by default; set `OSM_GAP_FILL_ENABLED=false` only when a deployment uses a separate Geofabrik workflow. `OVERPASS_API_URL` can point at a self-hosted or alternate compliant endpoint.

Google Maps, The Dyrt, Campendium, Hipcamp, KOA, and other commercial directories are not used without an explicit licensed feed or written permission to retain and republish their data. Protomaps tiles are a basemap only and are never mined for campground records.

## Known modeling limitations

- OSM records without a name or enough identifying information are excluded to reduce duplicate and pitch-level markers.
- Adjacent loops may be separate campgrounds or subdivisions of one campground. Uncertain records enter review; they are not merged merely because they are close.
- Source disappearance does not prove closure. Multiple misses and manual review are required.
- Country/region values may be incomplete in source records. Regional OSM imports should pass `--country` when the extract boundary makes that safe.
- Facilities with missing or invalid coordinates cannot appear on the map and are skipped with run counts.

Coverage should be measured by jurisdiction and source after each full import. Do not advertise complete coverage without an independently defined denominator and audit.

## Habitat-profile coverage

The offline `habitat-north-america-v1` processor can run for any valid Canadian or US campground coordinate. WorldCover, JRC surface water, Copernicus GLO-30 and NASA POWER form the shared baseline. Canada is enriched with CWIM3A, the US with NWI, and BC with the Freshwater Atlas. Other Canadian provinces do not yet have province-specific adapters. US fast/slow stream classification and regulatory floodplain polygons are also not implemented; those fields remain neutral or explicitly identified as proxies and confidence metadata records the gap.

Use `npm run habitat:verify` for the live measured/provisional/missing counts.
