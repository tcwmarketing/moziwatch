"""Resumable, versioned habitat profiling for US and Canadian campgrounds.

The processor reads small windows from cloud-optimised continental rasters and
queries national/provincial vector services. It never runs in a web request.
Run ``npm run habitat:export`` first, then process in bounded batches.
"""

from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import math
import os
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

warnings.filterwarnings(
    "ignore",
    message="Setting the shape on a NumPy array has been deprecated",
    category=DeprecationWarning,
)

import numpy as np
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
import rasterio
import requests
from pyproj import CRS, Transformer
from rasterio.features import geometry_mask, rasterize, shapes
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform, unary_union


ROOT = Path(__file__).resolve().parents[2]
FULL_CONFIG = json.loads((ROOT / "config" / "habitat-processing.json").read_text(encoding="utf-8"))
FAST_CONFIG = json.loads((ROOT / "config" / "habitat-major-fast.json").read_text(encoding="utf-8"))
MINOR_FAST_CONFIG = json.loads((ROOT / "config" / "habitat-minor-fast.json").read_text(encoding="utf-8"))
HABITAT_CONFIG = FULL_CONFIG
VERSION = HABITAT_CONFIG["version"]
USER_AGENT = "MoziWatch habitat processor/1.0 (https://github.com/tcwmarketing/moziwatch)"
WGS84 = CRS.from_epsg(4326)
CACHE = ROOT / ".cache" / "habitat" / "http"
CWIM_URL = "http://datacube-prod-data-public.s3.amazonaws.com/store/land/wetlands/wetland-inventory/canadian-wetland-inventory-v3a-classification.tif"
NWI_QUERY = "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/0/query"
NASA_POWER = "https://power.larc.nasa.gov/api/temporal/climatology/point"

FWA = {
    "wetlands": ("WHSE_BASEMAPPING.FWA_WETLANDS_POLY", "pub:WHSE_BASEMAPPING.FWA_WETLANDS_POLY"),
    "lakes": ("WHSE_BASEMAPPING.FWA_LAKES_POLY", "pub:WHSE_BASEMAPPING.FWA_LAKES_POLY"),
    "rivers": ("WHSE_BASEMAPPING.FWA_RIVERS_POLY", "pub:WHSE_BASEMAPPING.FWA_RIVERS_POLY"),
    "streams": ("WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP", "pub:WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP"),
}

CLASS_NAMES = {
    10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland",
    50: "built-up", 60: "bare or sparse vegetation", 70: "snow or ice",
    80: "permanent water", 90: "herbaceous wetland", 95: "mangrove",
    100: "moss or lichen",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, float(value)))


def rounded(value: float) -> float:
    return round(float(value), 6)


def local_crs(latitude: float, longitude: float) -> CRS:
    return CRS.from_proj4(
        f"+proj=aeqd +lat_0={latitude} +lon_0={longitude} +datum=WGS84 +units=m +no_defs"
    )


def project(geometry, source: CRS, target: CRS):
    transformer = Transformer.from_crs(source, target, always_xy=True)
    return transform(transformer.transform, geometry)


def cached_json(url: str, params: dict[str, Any], *, retries: int = 3) -> dict[str, Any]:
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
    path = CACHE / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    last_error = None
    for attempt in range(retries):
        try:
            response = requests.get(
                url,
                params=params,
                headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
                timeout=120,
            )
            if response.status_code == 429:
                time.sleep(2 ** (attempt + 1))
                continue
            response.raise_for_status()
            payload = response.json()
            temporary = path.with_suffix(f".{os.getpid()}.tmp")
            temporary.write_text(json.dumps(payload), encoding="utf-8")
            temporary.replace(path)
            return payload
        except Exception as error:  # the caller records the source gap
            last_error = error
            time.sleep(2 ** attempt)
    raise RuntimeError(f"GIS request failed: {url}: {last_error}")


class RasterPool:
    def __init__(self):
        self.datasets: dict[str, Any] = {}

    def open(self, url: str):
        if url not in self.datasets:
            self.datasets[url] = rasterio.open(url)
        return self.datasets[url]

    def close(self):
        for dataset in self.datasets.values():
            dataset.close()
        self.datasets.clear()


def cardinal(value: int, positive: str, negative: str, width: int) -> str:
    return f"{positive if value >= 0 else negative}{abs(value):0{width}d}"


def worldcover_url(lat: float, lon: float) -> str:
    south = math.floor(lat / 3) * 3
    west = math.floor(lon / 3) * 3
    tile = f"{cardinal(south, 'N', 'S', 2)}{cardinal(west, 'E', 'W', 3)}"
    return f"http://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"


def jrc_url(kind: str, lat: float, lon: float) -> str:
    north = math.ceil(lat / 10) * 10
    if north == lat and lat < 0:
        north += 10
    west = math.ceil(abs(lon) / 10) * 10 if lon < 0 else math.floor(lon / 10) * 10
    tile = f"{west}{'W' if lon < 0 else 'E'}_{abs(north)}{'N' if north >= 0 else 'S'}"
    return f"http://storage.googleapis.com/global-surface-water/downloads2021/{kind}/{kind}_{tile}v1_4_2021.tif"


def copernicus_dem_url(lat: float, lon: float) -> str:
    south = math.floor(lat)
    west = math.floor(lon)
    tile = f"Copernicus_DSM_COG_10_{cardinal(south, 'N', 'S', 2)}_00_{cardinal(west, 'E', 'W', 3)}_00_DEM"
    return f"http://copernicus-dem-30m.s3.amazonaws.com/{tile}/{tile}.tif"


def urls_for_bounds(bounds_wgs84, factory, step: float) -> list[str]:
    left, bottom, right, top = bounds_wgs84
    latitudes = np.arange(math.floor(bottom / step) * step, top + step, step)
    longitudes = np.arange(math.floor(left / step) * step, right + step, step)
    return sorted({factory(float(lat + step / 2), float(lon + step / 2)) for lat in latitudes for lon in longitudes})


def read_rasters_to_grid(
    pool: RasterPool,
    urls: Iterable[str],
    out_shape: tuple[int, int],
    out_transform,
    out_crs: CRS,
    *,
    nodata: float,
    dtype,
) -> tuple[np.ndarray, list[str]]:
    destination = np.full(out_shape, nodata, dtype=dtype)
    used = []
    bounds = rasterio.transform.array_bounds(*out_shape, out_transform)
    for url in urls:
        try:
            source = pool.open(url)
            transformer = Transformer.from_crs(out_crs, source.crs, always_xy=True)
            left, bottom, right, top = transformer.transform_bounds(*bounds, densify_pts=21)
            source_bounds = source.bounds
            if right <= source_bounds.left or left >= source_bounds.right or top <= source_bounds.bottom or bottom >= source_bounds.top:
                continue
            left, bottom = max(left, source_bounds.left), max(bottom, source_bounds.bottom)
            right, top = min(right, source_bounds.right), min(top, source_bounds.top)
            raw_window = from_bounds(left, bottom, right, top, source.transform)
            col_start = max(0, math.floor(raw_window.col_off))
            row_start = max(0, math.floor(raw_window.row_off))
            col_stop = min(source.width, math.ceil(raw_window.col_off + raw_window.width))
            row_stop = min(source.height, math.ceil(raw_window.row_off + raw_window.height))
            if col_stop <= col_start or row_stop <= row_start:
                continue
            window = rasterio.windows.Window(
                col_start,
                row_start,
                col_stop - col_start,
                row_stop - row_start,
            )
            values = source.read(1, window=window)
            reproject(
                source=values,
                destination=destination,
                src_transform=source.window_transform(window),
                src_crs=source.crs,
                src_nodata=source.nodata,
                dst_transform=out_transform,
                dst_crs=out_crs,
                dst_nodata=nodata,
                resampling=Resampling.nearest,
                init_dest_nodata=False,
            )
            used.append(url)
        except rasterio.errors.RasterioIOError:
            continue
    return destination, used


def local_grid(radius_m: int, resolution_m: int):
    size = math.ceil(radius_m * 2 / resolution_m)
    return (size, size), rasterio.transform.from_origin(-radius_m, radius_m, resolution_m, resolution_m)


def rings_for_grid(base, grid_shape, grid_transform):
    geometries = {
        "within250m": base.buffer(250),
        "from250mTo1km": base.buffer(1000).difference(base.buffer(250)),
        "from1kmTo3km": base.buffer(3000).difference(base.buffer(1000)),
        "from1kmTo5km": base.buffer(5000).difference(base.buffer(1000)),
    }
    masks = {
        name: geometry_mask([mapping(geometry)], out_shape=grid_shape, transform=grid_transform, invert=True)
        for name, geometry in geometries.items()
    }
    return geometries, masks


def fraction(values: np.ndarray, ring: np.ndarray) -> float:
    count = int(np.count_nonzero(ring))
    return float(np.count_nonzero(values & ring) / count) if count else 0.0


def ring_values(values: np.ndarray, rings: dict[str, np.ndarray]):
    return {name: rounded(fraction(values, ring)) for name, ring in rings.items()}


def vector_mask(geometries, local: CRS, grid_shape, grid_transform):
    projected = [project(geometry, WGS84, local) for geometry in geometries if not geometry.is_empty]
    return rasterize(
        [(mapping(geometry), 1) for geometry in projected],
        out_shape=grid_shape, transform=grid_transform, fill=0, dtype="uint8",
    ).astype(bool) if projected else np.zeros(grid_shape, dtype=bool)


def fetch_fwa(kind: str, bounds_wgs84):
    endpoint, typename = FWA[kind]
    return cached_json(
        f"https://openmaps.gov.bc.ca/geo/pub/{endpoint}/ows",
        {
            "service": "WFS", "version": "2.0.0", "request": "GetFeature",
            "typeNames": typename, "outputFormat": "application/json",
            "srsName": "EPSG:4326",
            "bbox": ",".join(str(value) for value in (*bounds_wgs84, "EPSG:4326")),
            "count": 10000,
        },
    ).get("features", [])


def fetch_nwi(bounds_wgs84):
    left, bottom, right, top = bounds_wgs84
    features = []
    offset = 0
    while True:
        payload = cached_json(
            NWI_QUERY,
            {
                "f": "geojson", "where": "1=1",
                "outFields": "Wetlands.ATTRIBUTE,Wetlands.WETLAND_TYPE,Wetlands.ACRES,NWI_Wetland_Codes.SYSTEM_NAME,NWI_Wetland_Codes.CLASS_NAME,NWI_Wetland_Codes.WATER_REGIME_NAME",
                "geometry": f"{left},{bottom},{right},{top}", "geometryType": "esriGeometryEnvelope",
                "inSR": 4326, "outSR": 4326, "spatialRel": "esriSpatialRelIntersects",
                "resultOffset": offset, "resultRecordCount": 2000,
            },
        )
        page = payload.get("features", [])
        features.extend(page)
        if len(page) < 2000:
            break
        offset += len(page)
    return features


def nwi_property(properties: dict[str, Any], name: str):
    return properties.get(name, properties.get(f"Wetlands.{name}", properties.get(f"NWI_Wetland_Codes.{name}")))


def geometries(features, predicate=lambda _: True):
    result = []
    for feature in features:
        if not feature.get("geometry") or not predicate(feature.get("properties", {})):
            continue
        parsed = shape(feature["geometry"])
        if not parsed.is_empty:
            result.append(parsed)
    return result


def water_components(permanent: np.ndarray, grid_transform, base):
    small, large = [], []
    for geometry, value in shapes(permanent.astype("uint8"), mask=permanent, transform=grid_transform):
        if value != 1:
            continue
        polygon = shape(geometry)
        if polygon.distance(base) > 5000:
            continue
        if polygon.area >= HABITAT_CONFIG["largeWaterMinimumAreaM2"]:
            large.append(polygon)
        elif polygon.area >= HABITAT_CONFIG["smallWaterMinimumAreaM2"]:
            small.append(polygon)
    return small, large


def stream_gradient(feature, line_local) -> float | None:
    raw = feature.get("properties", {}).get("GRADIENT")
    if raw is not None:
        try:
            return abs(float(raw))
        except (TypeError, ValueError):
            pass
    coordinates = feature.get("geometry", {}).get("coordinates", [])
    while coordinates and isinstance(coordinates[0][0], (list, tuple)):
        coordinates = max(coordinates, key=len)
    if len(coordinates) > 1 and len(coordinates[0]) >= 3 and len(coordinates[-1]) >= 3:
        return abs(float(coordinates[-1][2]) - float(coordinates[0][2])) / max(line_local.length, 1)
    return None


def climate_normal(latitude: float, longitude: float):
    # POWER meteorology is 0.5 x 0.625 degrees. Snap requests to that grid so
    # nearby campgrounds share the cached response rather than hammering the API.
    grid_lat = round(latitude / 0.5) * 0.5
    grid_lon = round(longitude / 0.625) * 0.625
    payload = cached_json(
        NASA_POWER,
        {
            "parameters": "PRECTOTCORR", "community": "AG",
            "longitude": grid_lon, "latitude": grid_lat, "format": "JSON",
            "start": 1991, "end": 2020,
        },
    )
    values = payload["properties"]["parameter"]["PRECTOTCORR"]
    names = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    monthly = {month: float(values[name]) * calendar.monthrange(2001, month)[1] for month, name in enumerate(names, 1)}
    return {
        "annualMm": sum(monthly.values()),
        "warmSeasonMm": sum(monthly[month] for month in range(5, 10)),
        "monthlyMm": monthly,
        "gridPoint": {"latitude": grid_lat, "longitude": grid_lon},
        "period": "1991-2020",
        "source": payload.get("header", {}).get("sources", ["MERRA-2"]),
        "apiVersion": payload.get("header", {}).get("api", {}).get("version"),
    }


def process(campground: dict[str, Any], pool: RasterPool, processed_at: str, fast: bool = False):
    latitude = float(campground["latitude"])
    longitude = float(campground["longitude"])
    local = local_crs(latitude, longitude)
    base = Point(0, 0)
    radius_m = 3000 if fast else 5000
    resolution_m = 30 if fast else 10
    grid_shape, grid_transform = local_grid(radius_m, resolution_m)
    ring_geometries, ring_masks = rings_for_grid(base, grid_shape, grid_transform)
    aoi_wgs84 = project(base.buffer(radius_m + 100), local, WGS84)
    gaps = []
    sources = []

    worldcover_urls = urls_for_bounds(aoi_wgs84.bounds, worldcover_url, 3)
    worldcover, used_worldcover = read_rasters_to_grid(pool, worldcover_urls, grid_shape, grid_transform, local, nodata=0, dtype="uint8")
    if not used_worldcover:
        gaps.append("ESA WorldCover was unavailable; land cover is unclassified and confidence is reduced.")
    else:
        sources.append({"name": "ESA WorldCover", "version": "2021 v200", "resolution": "10 m", "processedAt": processed_at, "coverage": rounded(np.count_nonzero(worldcover) / worldcover.size)})

    occurrence_urls = urls_for_bounds(aoi_wgs84.bounds, lambda lat, lon: jrc_url("occurrence", lat, lon), 10)
    seasonality_urls = urls_for_bounds(aoi_wgs84.bounds, lambda lat, lon: jrc_url("seasonality", lat, lon), 10)
    occurrence, used_occurrence = read_rasters_to_grid(pool, occurrence_urls, grid_shape, grid_transform, local, nodata=255, dtype="uint8")
    seasonality, used_seasonality = read_rasters_to_grid(pool, seasonality_urls, grid_shape, grid_transform, local, nodata=255, dtype="uint8")
    if not used_occurrence or not used_seasonality:
        gaps.append("JRC Global Surface Water did not cover the complete analysis window.")
    else:
        sources.append({"name": "JRC Global Surface Water", "version": "v1.4 1984-2021", "resolution": "30 m", "processedAt": processed_at, "coverage": 1})

    marsh = np.zeros(grid_shape, dtype=bool)
    other_wetland = worldcover == 90
    vector_lakes = []
    stream_features = []
    enrichment = "none"
    wetland_enriched = False
    hydrography_coverage = 0.0
    if fast:
        enrichment = "continental-baseline-fast"
        profile_tier = "minor" if VERSION == "habitat-minor-fast-v1" else "major"
        gaps.append(f"National and provincial vector enrichment is deferred in the fast {profile_tier}-campground profile; confidence is reduced.")
    elif campground["country"] == "CA":
        cwim, used_cwim = read_rasters_to_grid(pool, [CWIM_URL], grid_shape, grid_transform, local, nodata=15, dtype="uint8")
        if used_cwim:
            marsh |= cwim == 4
            other_wetland |= np.isin(cwim, [1, 2, 3])
            sources.append({"name": "Canadian Wetland Inventory Map", "version": "CWIM3A", "resolution": "10 m", "processedAt": processed_at, "coverage": 1})
            enrichment = "CWIM3A"
            wetland_enriched = True
        else:
            gaps.append("Canadian Wetland Inventory Map was unavailable; WorldCover wetland class was used.")
        if campground.get("region") == "BC":
            try:
                fwa = {kind: fetch_fwa(kind, aoi_wgs84.bounds) for kind in FWA}
                marsh_features = geometries(fwa["wetlands"], lambda p: "MARSH" in str(p).upper())
                wetland_features = geometries(fwa["wetlands"])
                marsh |= vector_mask(marsh_features, local, grid_shape, grid_transform)
                other_wetland |= vector_mask(wetland_features, local, grid_shape, grid_transform) & ~marsh
                vector_lakes = geometries(fwa["lakes"])
                stream_features = fwa["streams"]
                sources.append({"name": "BC Freshwater Atlas", "version": "live WFS snapshot", "resolution": "mapped vectors", "processedAt": processed_at, "coverage": 1})
                enrichment = f"{enrichment}+BC Freshwater Atlas"
                wetland_enriched = True
                hydrography_coverage = 0.10
            except Exception as error:
                gaps.append(f"BC Freshwater Atlas enrichment was unavailable ({type(error).__name__}); the Canadian continental baseline was retained.")
        else:
            gaps.append("No province-specific hydrography adapter is configured; the national baseline remains active.")
    elif campground["country"] == "US":
        try:
            nwi = fetch_nwi(aoi_wgs84.bounds)
            emergent = geometries(
                nwi,
                lambda p: "EMERGENT" in str(nwi_property(p, "WETLAND_TYPE") or "").upper()
                or "EMERGENT" in str(nwi_property(p, "CLASS_NAME") or "").upper(),
            )
            wet = geometries(
                nwi,
                lambda p: "WETLAND" in str(nwi_property(p, "WETLAND_TYPE") or "").upper(),
            )
            vector_lakes = geometries(
                nwi,
                lambda p: nwi_property(p, "WETLAND_TYPE") in ("Lake", "Freshwater Pond"),
            )
            marsh |= vector_mask(emergent, local, grid_shape, grid_transform)
            other_wetland |= vector_mask(wet, local, grid_shape, grid_transform) & ~marsh
            sources.append({"name": "US Fish and Wildlife Service National Wetlands Inventory", "version": "live REST snapshot", "resolution": "mapped vectors", "processedAt": processed_at, "coverage": 1})
            enrichment = "NWI"
            wetland_enriched = True
            hydrography_coverage = 0.05
        except Exception as error:
            gaps.append(f"National Wetlands Inventory enrichment was unavailable ({type(error).__name__}); the continental WorldCover/JRC baseline was retained.")
        gaps.append("US fast/slow stream classification awaits a national hydrography line adapter; proximity is left neutral.")
    else:
        raise RuntimeError(f"Unsupported country: {campground['country']}")

    seasonal = (occurrence > 0) & (occurrence <= 100) & (seasonality >= 1) & (seasonality < 12) & ~marsh & ~other_wetland
    permanent = (seasonality == 12) | (worldcover == 80)
    if vector_lakes:
        permanent |= vector_mask(vector_lakes, local, grid_shape, grid_transform)
    small_water, large_water = water_components(permanent, grid_transform, base)
    large_union = unary_union(large_water) if large_water else None
    lake_distance = base.distance(large_union) if large_union else 5000
    shoreline_km = large_union.boundary.intersection(base.buffer(1000)).length / 1000 if large_union else 0
    large_coverage = large_union.intersection(base.buffer(1000)).area / base.buffer(1000).area if large_union else 0
    small_count = sum(1 for polygon in small_water if polygon.distance(base) <= 3000)
    small_density = 1 - math.exp(-small_count / HABITAT_CONFIG["smallWaterDensityScale"])

    fast_lines, slow_lines, stream_details = [], [], []
    for feature in stream_features:
        geometry = shape(feature["geometry"])
        line_local = project(geometry, WGS84, local)
        gradient = stream_gradient(feature, line_local)
        distance = line_local.distance(base)
        stream_details.append({"name": feature.get("properties", {}).get("GNIS_NAME"), "gradient": rounded(gradient) if gradient is not None else None, "distanceM": rounded(distance)})
        if gradient is not None and gradient >= HABITAT_CONFIG["fastStreamMinimumGradient"]:
            fast_lines.append(line_local)
        elif gradient is not None and gradient <= HABITAT_CONFIG["slowStreamMaximumGradient"]:
            slow_lines.append(line_local)
    fast_distance = base.distance(unary_union(fast_lines)) if fast_lines else 5000
    slow_distance = base.distance(unary_union(slow_lines)) if slow_lines else 5000
    fast_proximity = math.exp(-fast_distance / HABITAT_CONFIG["riverProximityScaleM"])
    slow_proximity = math.exp(-slow_distance / HABITAT_CONFIG["riverProximityScaleM"])

    terrain_shape, terrain_transform = local_grid(1000, 30)
    terrain_bounds_wgs84 = project(base.buffer(1100), local, WGS84).bounds
    dem_urls = urls_for_bounds(terrain_bounds_wgs84, copernicus_dem_url, 1)
    dem, used_dem = read_rasters_to_grid(pool, dem_urls, terrain_shape, terrain_transform, local, nodata=-9999, dtype="float32")
    valid_dem = dem > -1000
    if not used_dem or not np.any(valid_dem):
        elevation_m, slope_degrees = 0.0, 0.0
        gaps.append("Copernicus GLO-30 elevation was unavailable; elevation and slope are neutral placeholders.")
    else:
        dy, dx = np.gradient(np.where(valid_dem, dem, np.nan), 30, 30)
        slope = np.degrees(np.arctan(np.sqrt(dx * dx + dy * dy)))
        elevation_mask = geometry_mask([mapping(base.buffer(90))], out_shape=terrain_shape, transform=terrain_transform, invert=True) & valid_dem
        slope_mask = geometry_mask([mapping(base.buffer(250))], out_shape=terrain_shape, transform=terrain_transform, invert=True) & valid_dem
        elevation_m = float(np.nanmedian(dem[elevation_mask]))
        slope_degrees = float(np.nanmedian(slope[slope_mask]))
        sources.append({"name": "Copernicus DEM GLO-30 Public", "version": "2021 release", "resolution": "30 m", "processedAt": processed_at, "coverage": rounded(np.count_nonzero(valid_dem) / valid_dem.size)})

    climate_available = True
    try:
        climate = climate_normal(latitude, longitude)
        sources.append({"name": "NASA POWER MERRA-2 climatology", "version": "1991-2020", "resolution": "0.5 x 0.625 degrees", "processedAt": processed_at, "coverage": 1})
    except Exception as error:
        climate_available = False
        climate = {"annualMm": 0, "warmSeasonMm": 0, "monthlyMm": {}, "gridPoint": None, "period": "unavailable", "source": [], "apiVersion": None}
        gaps.append(f"NASA POWER rainfall climatology was unavailable ({type(error).__name__}); rainfall climate is neutral and confidence is reduced.")
    forest_rings = ring_values(worldcover == 10, ring_masks)
    marsh_rings = ring_values(marsh, ring_masks)
    wetland_rings = ring_values(other_wetland & ~marsh, ring_masks)
    seasonal_rings = ring_values(seasonal, ring_masks)
    vegetation = np.isin(worldcover, [10, 20, 30, 40, 90, 95, 100])
    vegetation_coverage = 0.7 * fraction(vegetation, ring_masks["within250m"]) + 0.3 * fraction(vegetation, ring_masks["from250mTo1km"])
    drainage = clamp(0.2 + min(slope_degrees / 15, 1) * 0.6 + (1 - vegetation_coverage) * 0.2 - min(1, wetland_rings["within250m"] * 4) * 0.3)
    distance_weights = HABITAT_CONFIG["distanceRingWeights"]
    weighted = lambda values: distance_weights[0] * values["within250m"] + distance_weights[1] * values["from250mTo1km"] + distance_weights[2] * values["from1kmTo3km"]
    stagnant_weights = HABITAT_CONFIG["stagnantWaterWeights"]
    stagnant = clamp(stagnant_weights["marsh"] * weighted(marsh_rings) + stagnant_weights["otherWetland"] * weighted(wetland_rings) + stagnant_weights["seasonalWater"] * weighted(seasonal_rings) + stagnant_weights["smallWaterDensity"] * small_density + stagnant_weights["slowRiver"] * slow_proximity)
    classes, counts = np.unique(worldcover[ring_masks["within250m"] & (worldcover > 0)], return_counts=True)
    order = np.argsort(counts)[::-1]
    land_cover = " / ".join(CLASS_NAMES.get(int(classes[index]), f"class {classes[index]}") for index in order[:2]) or "unclassified"
    flood_proxy = clamp((1 - drainage) * (weighted(marsh_rings) + weighted(wetland_rings) + weighted(seasonal_rings) + math.exp(-lake_distance / 250)) / 4)

    base_coverage = (0.25 if used_worldcover else 0) + (0.15 if used_occurrence and used_seasonality else 0) + (0.15 if used_dem else 0) + (0.10 if climate_available else 0)
    wetland_coverage = 0.15 if wetland_enriched else 0
    profile_confidence = clamp(base_coverage + wetland_coverage + hydrography_coverage, 0, 0.9)
    profile = {
        "profileVersion": VERSION, "dataKind": "measured-geospatial",
        "wetlandCoverage": wetland_rings, "marshCoverage": marsh_rings,
        "seasonalWaterCoverage": seasonal_rings,
        "smallWaterBodyDensity": rounded(small_density), "stagnantWaterPotential": rounded(stagnant),
        "lakeShorelineProximity": rounded(math.exp(-lake_distance / HABITAT_CONFIG["lakeProximityScaleM"])),
        "shorelineWaterEdgeLengthKm": rounded(shoreline_km), "largeOpenWaterCoverage": rounded(large_coverage),
        "fastRiverProximity": rounded(fast_proximity), "slowRiverProximity": rounded(slow_proximity),
        "forestCoverage": forest_rings, "vegetationCoverage": rounded(vegetation_coverage),
        "elevationM": rounded(elevation_m), "slopeDegrees": rounded(slope_degrees),
        "drainagePotential": rounded(drainage), "floodplainExposure": rounded(flood_proxy),
        "annualRainfallMm": rounded(climate["annualMm"]), "warmSeasonRainfallMm": rounded(climate["warmSeasonMm"]),
        "landCoverType": land_cover, "profileConfidence": rounded(profile_confidence),
        "dataCoverage": {"overall": rounded(profile_confidence), "sources": sources},
    }
    provenance = {
        "campground": {"id": campground["id"], "coordinates": {"latitude": latitude, "longitude": longitude}, "geometryBasis": "canonical campground point"},
        "processingMode": "minor-simplified-30m-3km" if VERSION == "habitat-minor-fast-v1" else "major-fast-30m-3km" if fast else "full-10m-5km",
        "sourceEnrichment": enrichment, "smallWaterBodiesWithin3km": small_count,
        "nearestLargeWaterDistanceM": rounded(lake_distance), "largeWaterShorelineWithin1kmKm": rounded(shoreline_km),
        "nearestFastStreamDistanceM": rounded(fast_distance), "nearestSlowStreamDistanceM": rounded(slow_distance),
        "climateNormal": climate, "coverageGaps": gaps,
        "deduplication": "Marsh is removed from other wetland; mapped wetland and marsh are removed from JRC seasonal water; large open water remains separate from shoreline.",
        "streamClassification": {"fastThreshold": "gradient >= 0.015 m/m", "slowThreshold": "gradient <= 0.005 m/m", "features": sorted(stream_details, key=lambda item: item["distanceM"])[:50]},
        "formulas": {
            "rings": "non-overlapping 0-250m, 250m-1km and 1-3km circles; the legacy 1-5km compatibility field is clipped at 3km in fast mode" if fast else "non-overlapping 0-250m, 250m-1km, 1-3km and 1-5km circles around the canonical campground point",
            "distanceRingWeights": [0.6, 0.3, 0.1], "smallWaterDensity": "1-exp(-waterBodiesUnder10haWithin3km/5)",
            "waterProximity": "exp(-distanceM/250)", "riverProximity": "exp(-distanceM/500)",
            "stagnantWaterPotential": "0.40*marsh + 0.20*otherWetland + 0.15*seasonalWater + 0.15*smallWaterDensity + 0.10*slowRiver",
            "floodplainExposure": "labelled proxy: (1-drainage)*(weighted wetland+marsh+seasonal water+lake proximity)/4",
        },
    }
    return {"campgroundSlug": campground["slug"], "profile": profile, "sourceProvenance": provenance}


def source_manifest(processed_at: str, fast: bool = False):
    sources = [
        {"name": "ESA WorldCover 2021 v200", "license": "CC BY 4.0", "use": "10m land cover, forest and vegetation"},
        {"name": "JRC Global Surface Water v1.4", "license": "Copernicus free and open use with attribution", "use": "seasonal and permanent surface water"},
        {"name": "Copernicus DEM GLO-30 Public", "license": "Copernicus DEM free public licence", "use": "elevation and slope"},
        {"name": "NASA POWER MERRA-2 climatology", "license": "NASA open data / CC0 unless otherwise marked", "use": "consistent 1991-2020 rainfall baseline"},
    ]
    if not fast:
        sources.extend([
            {"name": "Canadian Wetland Inventory Map v3A", "license": "Open Government Licence - Canada", "use": "Canadian wetland classes"},
            {"name": "USFWS National Wetlands Inventory", "license": "US federal public data", "use": "US wetland and marsh enrichment"},
            {"name": "BC Freshwater Atlas", "license": "Open Government Licence - British Columbia", "use": "BC wetlands, lakes and streams"},
        ])
    return {
        "processedAt": processed_at,
        "coverage": f"{HABITAT_CONFIG.get('selection', 'United States and Canada')}; continental baseline only" if fast else "United States and Canada; provincial enrichment currently configured for British Columbia",
        "sources": sources,
    }


def write_output(path: Path, processed_at: str, profiles, errors, fast: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": VERSION, "dataKind": "measured-geospatial",
        "sourceManifest": source_manifest(processed_at, fast),
        "methodNotes": f"Offline, resumable fast profile for {HABITAT_CONFIG.get('selection', 'selected campgrounds')}. Equal-area local 30m grids cover 3km using ESA WorldCover, JRC surface water, Copernicus elevation and cached NASA rainfall normals. National/provincial vector enrichment is deferred and confidence is reduced." if fast else "Offline, resumable North American habitat processing. Equal-area local 10m grids measure non-overlapping distance rings. National baseline sources are enriched by NWI in the US, CWIM in Canada and BC Freshwater Atlas in British Columbia. Missing enrichments reduce confidence and are retained as per-location coverage gaps.",
        "profiles": profiles, "processingErrors": errors,
    }
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main():
    global HABITAT_CONFIG, VERSION
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(ROOT / "data/habitat/north-america-campgrounds.json"))
    parser.add_argument("--output", default=str(ROOT / "data/habitat/batches/north-america-v1.json"))
    parser.add_argument("--slug")
    parser.add_argument("--country", choices=["CA", "US"])
    parser.add_argument("--start-after")
    parser.add_argument("--limit", type=int, default=25, help="0 processes every matching campground")
    parser.add_argument("--offset", type=int, default=0, help="Skip this many filtered campgrounds before applying the limit")
    parser.add_argument("--only-unprofiled", action="store_true")
    parser.add_argument(
        "--only-version-missing",
        action="store_true",
        help="Skip campgrounds that already have this processor's profile version",
    )
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--retry-errors", action="store_true", help="With --resume, retry prior errors instead of treating them as completed")
    parser.add_argument("--allow-empty", action="store_true")
    parser.add_argument("--checkpoint-every", type=int, default=25, help="Rewrite the resumable output after this many processed locations")
    parser.add_argument("--fast", action="store_true", help="Use the versioned 30m/3km continental baseline for major campgrounds")
    parser.add_argument("--minor-fast", action="store_true", help="Use the versioned 30m/3km continental baseline for verified minor campgrounds")
    args = parser.parse_args()
    if args.fast and args.minor_fast:
        raise RuntimeError("Choose either --fast or --minor-fast")
    fast = args.fast or args.minor_fast
    HABITAT_CONFIG = MINOR_FAST_CONFIG if args.minor_fast else FAST_CONFIG if args.fast else FULL_CONFIG
    VERSION = HABITAT_CONFIG["version"]
    input_payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    selected = input_payload["campgrounds"]
    if args.slug:
        selected = [item for item in selected if item["slug"] == args.slug]
    if args.country:
        selected = [item for item in selected if item["country"] == args.country]
    if args.only_unprofiled:
        selected = [item for item in selected if not item.get("hasMeasuredProfile")]
    if args.only_version_missing:
        selected = [item for item in selected if VERSION not in item.get("profileVersions", [])]
    if args.start_after:
        selected = [item for item in selected if item["slug"] > args.start_after]
    output_path = Path(args.output)
    processed_at = utc_now()
    profiles, errors = [], []
    completed = set()
    if args.resume and output_path.exists():
        existing = json.loads(output_path.read_text(encoding="utf-8"))
        profiles = existing.get("profiles", [])
        errors = [] if args.retry_errors else existing.get("processingErrors", [])
        completed = {item["campgroundSlug"] for item in profiles}
        if not args.retry_errors:
            completed.update(item["campgroundSlug"] for item in errors)
        processed_at = existing.get("sourceManifest", {}).get("processedAt", processed_at)
    if args.offset > 0:
        selected = selected[args.offset:]
    if args.limit > 0:
        selected = selected[: args.limit]
    selected = [item for item in selected if item["slug"] not in completed]
    if not selected:
        if args.allow_empty:
            write_output(output_path, utc_now(), [], [], fast)
            print(f"No campgrounds matched; wrote an empty batch to {output_path}")
            return
        raise RuntimeError("No campgrounds matched the requested batch")
    pool = RasterPool()
    try:
        for index, campground in enumerate(selected, 1):
            print(f"[{index}/{len(selected)}] {campground['slug']}", flush=True)
            try:
                profiles.append(process(campground, pool, processed_at, fast))
            except Exception as error:
                errors.append({"campgroundSlug": campground["slug"], "error": str(error), "failedAt": utc_now()})
                print(f"  failed: {error}", flush=True)
            if index % max(1, args.checkpoint_every) == 0 or index == len(selected):
                write_output(output_path, processed_at, profiles, errors, fast)
    finally:
        pool.close()
    print(f"Wrote {len(profiles)} profiles and {len(errors)} errors to {output_path}")
    if not profiles:
        raise RuntimeError("The batch produced no usable habitat profiles")


if __name__ == "__main__":
    main()
