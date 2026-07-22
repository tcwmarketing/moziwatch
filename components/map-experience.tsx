"use client";

import { useEffect, useRef, useState } from "react";
import { CampgroundPrefetchLink } from "@/components/campground-prefetch-link";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { MARKER_STATES } from "@/config/ratings";
import { requiresCooperativeMapGestures } from "@/lib/map-interactions";
import { mapViewportCovers, type MapViewport } from "@/lib/map-query";
import { ReportForm } from "./report-form";

type MapConfig = {
  mode: string;
  styleUrl: string;
  apiKey: string;
  pmtilesUrl: string;
};
type Period = "recent" | "historical";
type MapScope = "verified" | "all";
type Selected = Record<string, string | number | null>;
type CampgroundMapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: Record<string, string | number | boolean | null>;
};
type CampgroundMapCollection = {
  type: "FeatureCollection";
  features: CampgroundMapFeature[];
};
type MapCacheEntry = {
  period: Period;
  scope: MapScope;
  search: string;
  zoom: number;
  bounds: MapViewport | null;
  data: CampgroundMapCollection;
};

const emptyCollection: CampgroundMapCollection = {
  type: "FeatureCollection",
  features: [],
};

export function MapExperience({ mapConfig }: { mapConfig: MapConfig }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const reportDialogRef = useRef<HTMLDialogElement>(null);
  const periodRef = useRef<Period>("recent");
  const scopeRef = useRef<MapScope>("verified");
  const queryRef = useRef("");
  const mapRequestRef = useRef<AbortController | null>(null);
  const detailCacheRef = useRef<Map<string, Selected>>(new Map());
  const detailPrefetchRef = useRef<Map<string, Promise<Selected>>>(new Map());
  const mapCacheRef = useRef<MapCacheEntry[]>([]);
  const refreshMapRef = useRef<() => void>(() => undefined);
  const searchMapRef = useRef<(search: string) => void>(() => undefined);
  const scope: MapScope = "verified";
  const missingBasemapKey = mapConfig.mode !== "pmtiles" && !mapConfig.apiKey;
  const [selected, setSelected] = useState<Selected | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(
    missingBasemapKey
      ? "Add a Protomaps API key to load campground and forecast map layers."
      : "Loading campground reports...",
  );

  function searchNearMe() {
    if (!navigator.geolocation)
      return setStatus("Location search is not supported by this browser.");
    setStatus("Finding your location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        mapRef.current?.flyTo({
          center: [coords.longitude, coords.latitude],
          zoom: 8,
        });
        setStatus("Map centered near your current location.");
      },
      () =>
        setStatus(
          "Location was not available. You can still search by campground or city.",
        ),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    if (mapConfig.mode !== "pmtiles" && !mapConfig.apiKey) return;
    let cancelled = false;
    let cleanupProtocol: (() => void) | undefined;
    let moveTimer: ReturnType<typeof setTimeout> | undefined;
    let lastSettledZoom = 3;
    const detailCache = detailCacheRef.current;
    const detailPrefetch = detailPrefetchRef.current;

    async function startMap() {
      const maplibre = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      let style: string | StyleSpecification;
      if (mapConfig.mode === "pmtiles" && mapConfig.pmtilesUrl) {
        const [{ Protocol }, basemaps] = await Promise.all([
          import("pmtiles"),
          import("@protomaps/basemaps"),
        ]);
        const protocol = new Protocol();
        maplibre.addProtocol("pmtiles", protocol.tile);
        cleanupProtocol = () => maplibre.removeProtocol("pmtiles");
        style = {
          version: 8,
          glyphs:
            "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
          sprite:
            "https://protomaps.github.io/basemaps-assets/sprites/v4/light",
          sources: {
            protomaps: {
              type: "vector",
              url: `pmtiles://${mapConfig.pmtilesUrl}`,
              attribution:
                '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
            },
          },
          layers: basemaps.layers("protomaps", basemaps.namedFlavor("light"), {
            lang: "en",
          }),
        };
      } else {
        style = mapConfig.styleUrl.replace(
          "{key}",
          encodeURIComponent(mapConfig.apiKey),
        );
      }
      if (cancelled || !container.current) return;
      const map = new maplibre.Map({
        container: container.current,
        style,
        center: [-104, 48.8],
        zoom: 3.1,
        minZoom: 2,
        maxZoom: 16,
        cooperativeGestures: requiresCooperativeMapGestures(
          window.matchMedia.bind(window),
        ),
        attributionControl: false,
      });
      mapRef.current = map;
      lastSettledZoom = Math.floor(map.getZoom());
      const initialCampgrounds = requestCampgrounds(map, "recent").catch(
        (error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return null;
          throw error;
        },
      );
      refreshMapRef.current = () => {
        void loadCampgrounds(
          map,
          periodRef.current,
          queryRef.current || undefined,
        );
      };
      searchMapRef.current = (search) => {
        void loadCampgrounds(map, periodRef.current, search, false);
      };
      map.addControl(
        new maplibre.NavigationControl({ showCompass: false }),
        "top-right",
      );
      map.addControl(
        new maplibre.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: false,
        }),
        "top-right",
      );
      map.addControl(
        new maplibre.AttributionControl({
          compact: true,
          customAttribution: [
            '<a href="https://protomaps.com">Protomaps</a>',
            '<a href="https://open-meteo.com/">Forecast weather by Open-Meteo</a>',
          ],
        }),
      );
      map.on("load", async () => {
        map.addSource("campgrounds", {
          type: "geojson",
          data: emptyCollection,
        });
        map.addLayer({
          id: "campground-clusters",
          type: "circle",
          source: "campgrounds",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#0b4b45",
            "circle-radius": [
              "step",
              ["get", "point_count"],
              19,
              15,
              24,
              50,
              30,
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
        map.addLayer({
          id: "campground-cluster-count",
          type: "symbol",
          source: "campgrounds",
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"],
            "text-size": 13,
            "text-font": ["Noto Sans Regular"],
          },
          paint: { "text-color": "#fff" },
        });
        map.addLayer({
          id: "campground-markers",
          type: "circle",
          source: "campgrounds",
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": ["get", "marker_color"],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              7,
              10,
              11,
            ],
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
        map.on("click", "campground-markers", (event: MapLayerMouseEvent) => {
          const props = event.features?.[0]?.properties;
          if (props?.id)
            void loadCampgroundDetail(
              String(props.id),
              props as Record<string, string | number | null>,
            );
        });
        map.on("click", "campground-clusters", (event: MapLayerMouseEvent) => {
          const feature = event.features?.[0];
          if (feature?.geometry.type === "Point")
            map.easeTo({
              center: feature.geometry.coordinates as [number, number],
              zoom: Math.min(10, Math.max(map.getZoom() + 2, 5)),
            });
        });
        map.on("mouseenter", "campground-markers", (event) => {
          const id = event.features?.[0]?.properties?.id;
          if (id) void prefetchCampgroundDetail(String(id));
        });
        for (const layer of ["campground-markers", "campground-clusters"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
        map.on("movestart", () => {
          if (moveTimer) clearTimeout(moveTimer);
        });
        map.on("moveend", () => {
          if (queryRef.current) return;
          const nextZoom = Math.floor(map.getZoom());
          const zoomChanged = nextZoom !== lastSettledZoom;
          const zoomedOut = nextZoom < lastSettledZoom;
          lastSettledZoom = nextZoom;
          if (zoomChanged) {
            const usedCache = applyCachedCampgrounds(map, periodRef.current);
            if (zoomedOut && !usedCache && nextZoom <= 8) {
              (map.getSource("campgrounds") as GeoJSONSource).setData(
                emptyCollection,
              );
              setStatus("Loading campground map groups...");
            }
            void loadCampgrounds(map, periodRef.current);
          } else {
            moveTimer = setTimeout(
              () => void loadCampgrounds(map, periodRef.current),
              120,
            );
          }
        });
        const data = await initialCampgrounds;
        if (data) applyCampgrounds(map, data);
      });
    }

    async function requestCampgrounds(
      map: MapLibreMap,
      selectedPeriod: Period,
      search?: string,
      includeBounds = true,
    ) {
      mapRequestRef.current?.abort();
      const controller = new AbortController();
      mapRequestRef.current = controller;
      const requestZoom = Math.floor(map.getZoom());
      const parameters = new URLSearchParams({
        period: selectedPeriod,
        zoom: String(requestZoom),
        scope: scopeRef.current,
      });
      let requestBounds: MapViewport | null = null;
      if (includeBounds) {
        const bounds = map.getBounds();
        requestBounds = {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        };
        parameters.set(
          "bbox",
          [
            requestBounds.west,
            requestBounds.south,
            requestBounds.east,
            requestBounds.north,
          ]
            .map((value) => value.toFixed(4))
            .join(","),
        );
      }
      if (search) parameters.set("q", search);
      const response = await fetch(`/api/map/campgrounds?${parameters}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Campground map request failed");
      const data = (await response.json()) as CampgroundMapCollection;
      const cacheEntry: MapCacheEntry = {
        period: selectedPeriod,
        scope: scopeRef.current,
        search: search || "",
        zoom: requestZoom,
        bounds: requestBounds,
        data,
      };
      mapCacheRef.current = [
        cacheEntry,
        ...mapCacheRef.current.filter(
          (entry) =>
            !(
              entry.period === cacheEntry.period &&
              entry.scope === cacheEntry.scope &&
              entry.search === cacheEntry.search &&
              entry.zoom === cacheEntry.zoom &&
              entry.bounds?.west === cacheEntry.bounds?.west &&
              entry.bounds?.south === cacheEntry.bounds?.south &&
              entry.bounds?.east === cacheEntry.bounds?.east &&
              entry.bounds?.north === cacheEntry.bounds?.north
            ),
        ),
      ].slice(0, 24);
      return data;
    }

    function viewport(map: MapLibreMap): MapViewport {
      const bounds = map.getBounds();
      return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };
    }

    function applyCachedCampgrounds(
      map: MapLibreMap,
      selectedPeriod: Period,
      search = "",
      includeBounds = true,
    ) {
      const currentBounds = includeBounds ? viewport(map) : null;
      const cached = mapCacheRef.current.find(
        (entry) =>
          entry.period === selectedPeriod &&
          entry.scope === scopeRef.current &&
          entry.search === search &&
          entry.zoom === Math.floor(map.getZoom()) &&
          (currentBounds === null
            ? entry.bounds === null
            : entry.bounds !== null &&
              mapViewportCovers(entry.bounds, currentBounds)),
      );
      if (!cached) return false;
      applyCampgrounds(map, cached.data);
      return true;
    }

    function applyCampgrounds(map: MapLibreMap, data: CampgroundMapCollection) {
      if (!map.getSource("campgrounds")) return;
      (map.getSource("campgrounds") as GeoJSONSource).setData(data);
      const total = data.features.reduce(
        (sum, feature) => sum + Number(feature.properties.point_count || 1),
        0,
      );
      const grouped = data.features.some(
        (feature) => feature.properties.server_cluster,
      );
      setStatus(
        queryRef.current
          ? `${data.features.length.toLocaleString()} matching campgrounds`
          : grouped
            ? `${total.toLocaleString()} ${scopeRef.current === "verified" ? "verified" : "imported"} campgrounds in ${data.features.length.toLocaleString()} map groups`
            : `${data.features.length.toLocaleString()} ${scopeRef.current === "verified" ? "verified" : "imported"} campgrounds in this map area`,
      );
      if (queryRef.current && data.features.length === 1)
        map.easeTo({
          center: data.features[0].geometry.coordinates,
          zoom: 10,
        });
    }

    async function loadCampgrounds(
      map: MapLibreMap,
      selectedPeriod: Period,
      search?: string,
      includeBounds = true,
    ) {
      try {
        applyCachedCampgrounds(
          map,
          selectedPeriod,
          search || "",
          includeBounds,
        );
        const data = await requestCampgrounds(
          map,
          selectedPeriod,
          search,
          includeBounds,
        );
        applyCampgrounds(map, data);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setStatus("Campground reports are temporarily unavailable.");
      }
    }

    function detailCacheKey(campgroundId: string) {
      return `${campgroundId}:${periodRef.current}`;
    }

    function markerSelection(
      campgroundId: string,
      properties: Record<string, string | number | null>,
    ): Selected {
      return {
        id: campgroundId,
        name: properties.name || "Campground",
        slug: properties.slug || "",
        city: properties.city || "",
        region: properties.region || "",
        country: properties.country || "",
        location_type_label: "Campground",
        official_campsite_count: null,
        verification_status: null,
        source_label: null,
        maintenance_status: null,
        facilities_summary: null,
        recent_average: properties.recent_average,
        recent_count: properties.recent_count || 0,
        historical_average: properties.historical_average,
        historical_count: properties.historical_count || 0,
        selected_average: properties.selected_average,
        selected_count: properties.selected_count || 0,
        severity_label: properties.severity_label || "No recent reports",
        forecast_score: properties.forecast_score,
        forecast_level: properties.forecast_level,
        forecast_confidence: properties.forecast_confidence,
      };
    }

    function requestCampgroundDetail(campgroundId: string) {
      const key = detailCacheKey(campgroundId);
      const cached = detailCacheRef.current.get(key);
      if (cached) return Promise.resolve(cached);
      const pending = detailPrefetchRef.current.get(key);
      if (pending) return pending;
      const request = fetch(
        `/api/map/campgrounds/${encodeURIComponent(campgroundId)}?period=${periodRef.current}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("Campground detail request failed");
          const detail = (await response.json()) as Selected;
          detailCacheRef.current.set(key, detail);
          return detail;
        })
        .finally(() => detailPrefetchRef.current.delete(key));
      detailPrefetchRef.current.set(key, request);
      return request;
    }

    async function prefetchCampgroundDetail(campgroundId: string) {
      try {
        await requestCampgroundDetail(campgroundId);
      } catch {
        // A hover prefetch is opportunistic; clicking will retry it.
      }
    }

    async function loadCampgroundDetail(
      campgroundId: string,
      properties?: Record<string, string | number | null>,
    ) {
      const cached = detailCacheRef.current.get(detailCacheKey(campgroundId));
      if (cached) {
        setSelected(cached);
        setStatus("Campground details loaded");
        return;
      }
      if (properties) setSelected(markerSelection(campgroundId, properties));
      setStatus("Loading additional campground details...");
      try {
        setSelected(await requestCampgroundDetail(campgroundId));
        setStatus("Campground details loaded");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setStatus("Campground details are temporarily unavailable.");
      }
    }

    void startMap();
    return () => {
      cancelled = true;
      if (moveTimer) clearTimeout(moveTimer);
      mapRequestRef.current?.abort();
      mapCacheRef.current = [];
      detailCache.clear();
      detailPrefetch.clear();
      refreshMapRef.current = () => undefined;
      searchMapRef.current = () => undefined;
      mapRef.current?.remove();
      mapRef.current = null;
      cleanupProtocol?.();
    };
  }, [mapConfig]);

  useEffect(() => {
    scopeRef.current = scope;
    mapCacheRef.current = [];
    const map = mapRef.current;
    if (!map?.getSource("campgrounds")) return;
    setSelected(null);
    refreshMapRef.current();
  }, [scope]);

  useEffect(() => {
    const normalized = query.trim();
    queryRef.current = normalized;
    const map = mapRef.current;
    if (!map?.getSource("campgrounds")) return;
    if (!normalized) {
      refreshMapRef.current();
      return;
    }
    const timer = setTimeout(() => searchMapRef.current(normalized), 220);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <section
      className="map-shell"
      aria-label="Campground mosquito conditions map"
    >
      <div className="map-toolbar">
        <label className="map-search">
          <span className="sr-only">Search campgrounds</span>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search campground, city, or region"
          />
        </label>
        <button className="map-action" type="button" onClick={searchNearMe}>
          Near me
        </button>
      </div>
      <div ref={container} className="map-canvas" />
      {!mapConfig.apiKey && mapConfig.mode !== "pmtiles" ? (
        <div className="map-config-notice">
          <strong>Basemap key needed</strong>
          <span>
            Add NEXT_PUBLIC_PROTOMAPS_API_KEY to display the Protomaps basemap.
          </span>
        </div>
      ) : null}
      <div className="map-status" role="status">
        {status}
      </div>
      <div className="map-legend">
        <strong>Camper reports</strong>
        <div className="legend-row">
          {MARKER_STATES.map((state) => (
            <span key={state.key}>
              <i style={{ background: state.color }} />
              {state.label}
            </span>
          ))}
        </div>
      </div>
      {selected ? (
        <aside
          className="campground-sheet"
          aria-label={`${selected.name} details`}
        >
          <button
            className="sheet-close"
            onClick={() => setSelected(null)}
            aria-label="Close campground details"
          >
            ×
          </button>
          <p className="eyebrow">Campground details</p>
          <h2>{selected.name}</h2>
          <p className="location-kind">
            <strong>{selected.location_type_label || "Campground"}</strong>
            {selected.official_campsite_count !== null
              ? ` · ${selected.official_campsite_count} campsite${Number(selected.official_campsite_count) === 1 ? "" : "s"}`
              : ""}
          </p>
          <p>
            {selected.city}, {selected.region}
          </p>
          {selected.maintenance_status || selected.facilities_summary ? (
            <p className="location-source-details">
              {[selected.maintenance_status, selected.facilities_summary]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          {selected.source_label ? (
            <small>
              {selected.verification_status === "unverified"
                ? "Imported discovery record from"
                : "Location verified from"}{" "}
              {selected.source_label}.
            </small>
          ) : null}
          <p className="severity-line">
            <i style={{ background: String(selected.marker_color) }} />
            Current marker: {selected.severity_label}
          </p>
          <div className="forecast-sheet-summary">
            <p className="eyebrow">Mosquito outlook</p>
            {selected.forecast_score !== null &&
            selected.forecast_score !== undefined ? (
              <p>
                <strong>{selected.forecast_level}</strong> tonight ·{" "}
                {Math.round(Number(selected.forecast_score) * 100)}
                /100 · {Math.round(Number(selected.forecast_confidence) * 100)}%
                confidence
              </p>
            ) : (
              <p>No campground-specific outlook is available yet.</p>
            )}
            <small>
              Modeled outlooks never change the report-colored marker.
            </small>
          </div>
          <p className="recent-line">
            Most recent:{" "}
            {selected.most_recent_report_at
              ? new Date(
                  String(selected.most_recent_report_at),
                ).toLocaleDateString()
              : "No published reports"}
          </p>
          <div className="campground-sheet-actions">
            <button
              className="button primary"
              type="button"
              onClick={() => reportDialogRef.current?.showModal()}
            >
              Submit Report
            </button>
            <CampgroundPrefetchLink
              className="button secondary"
              href={`/campgrounds/${selected.slug}`}
            >
              Full Details
            </CampgroundPrefetchLink>
          </div>
          <dialog
            className="site-dialog map-report-dialog"
            ref={reportDialogRef}
            onClick={(event) => {
              if (event.target === event.currentTarget)
                event.currentTarget.close();
            }}
          >
            <button
              className="dialog-close"
              type="button"
              aria-label="Close report form"
              onClick={() => reportDialogRef.current?.close()}
            >
              &times;
            </button>
            <p className="eyebrow">Actual camper report</p>
            <h2>Report mosquitoes at {selected.name}</h2>
            <ReportForm campgroundId={String(selected.id)} compact />
          </dialog>
        </aside>
      ) : null}
    </section>
  );
}
