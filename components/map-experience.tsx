"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import { MARKER_STATES } from "@/config/ratings";
import { ReportForm } from "./report-form";

type MapConfig = {
  mode: string;
  styleUrl: string;
  apiKey: string;
  pmtilesUrl: string;
};
type Period = "recent" | "historical";
type Selected = Record<string, string | number | null>;

const emptyCollection = { type: "FeatureCollection" as const, features: [] };

export function MapExperience({ mapConfig }: { mapConfig: MapConfig }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const allCampgrounds = useRef<typeof emptyCollection>(emptyCollection);
  const [period, setPeriod] = useState<Period>("recent");
  const [forecastOn, setForecastOn] = useState(true);
  const missingBasemapKey = mapConfig.mode !== "pmtiles" && !mapConfig.apiKey;
  const [forecastMeta, setForecastMeta] = useState(
    missingBasemapKey
      ? "Forecast display will start after the basemap is configured."
      : "Checking forecast...",
  );
  const [selected, setSelected] = useState<Selected | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(
    missingBasemapKey
      ? "Add a Protomaps API key to load campground and forecast map layers."
      : "Loading campground reports...",
  );

  function searchThisArea() {
    const map = mapRef.current;
    const source = map?.getSource("campgrounds") as GeoJSONSource | undefined;
    if (!map || !source) return;
    const bounds = map.getBounds();
    const normalized = query.trim().toLowerCase();
    const visible = {
      ...allCampgrounds.current,
      features: allCampgrounds.current.features.filter(
        (feature: {
          geometry?: { coordinates?: [number, number] };
          properties?: { name?: string; city?: string; region?: string };
        }) => {
          const coordinates = feature.geometry?.coordinates;
          const matchesText = normalized
            ? [
                feature.properties?.name,
                feature.properties?.city,
                feature.properties?.region,
              ].some((value) => value?.toLowerCase().includes(normalized))
            : true;
          return coordinates
            ? bounds.contains(coordinates) && matchesText
            : false;
        },
      ),
    };
    source.setData(visible);
    setStatus(`${visible.features.length} campgrounds in this map area`);
  }

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
        setStatus(
          "Map centered near your current location. Choose Search this area to filter campgrounds.",
        );
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
        attributionControl: false,
      });
      mapRef.current = map;
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
        map.addSource("mosquito-forecast", {
          type: "geojson",
          data: emptyCollection,
        });
        map.addLayer({
          id: "mosquito-forecast-heat",
          type: "heatmap",
          source: "mosquito-forecast",
          maxzoom: 11,
          paint: {
            "heatmap-weight": [
              "interpolate",
              ["linear"],
              ["get", "score"],
              0,
              0,
              1,
              1,
            ],
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              0.65,
              9,
              2,
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              2,
              18,
              9,
              48,
            ],
            "heatmap-opacity": 0.68,
            "heatmap-color": [
              "interpolate",
              ["linear"],
              ["heatmap-density"],
              0,
              "rgba(247,243,222,0)",
              0.25,
              "#f1d65c",
              0.5,
              "#ee973f",
              0.75,
              "#c84c36",
              1,
              "#6f1d3b",
            ],
          },
        });
        map.addSource("campgrounds", {
          type: "geojson",
          data: emptyCollection,
          cluster: true,
          clusterMaxZoom: 9,
          clusterRadius: 46,
        });
        map.addLayer({
          id: "campground-clusters",
          type: "circle",
          source: "campgrounds",
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "#173f35",
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
          if (props) setSelected(props as Selected);
        });
        map.on(
          "click",
          "campground-clusters",
          async (event: MapLayerMouseEvent) => {
            const feature = event.features?.[0];
            const source = map.getSource("campgrounds") as GeoJSONSource;
            if (!feature?.properties?.cluster_id) return;
            const zoom = await source.getClusterExpansionZoom(
              feature.properties.cluster_id,
            );
            if (feature.geometry.type === "Point")
              map.easeTo({
                center: feature.geometry.coordinates as [number, number],
                zoom,
              });
          },
        );
        for (const layer of ["campground-markers", "campground-clusters"]) {
          map.on("mouseenter", layer, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", layer, () => {
            map.getCanvas().style.cursor = "";
          });
        }
        await Promise.all([loadCampgrounds(map, "recent"), loadForecast(map)]);
      });
    }

    async function loadCampgrounds(map: MapLibreMap, selectedPeriod: Period) {
      try {
        const response = await fetch(
          `/api/map/campgrounds?period=${selectedPeriod}`,
        );
        if (!response.ok) throw new Error();
        const data = await response.json();
        allCampgrounds.current = data;
        (map.getSource("campgrounds") as GeoJSONSource).setData(data);
        setStatus(`${data.features.length} campgrounds with report status`);
      } catch {
        setStatus("Campground reports are temporarily unavailable.");
      }
    }

    async function loadForecast(map: MapLibreMap) {
      try {
        const response = await fetch("/api/forecast/latest");
        const result = await response.json();
        if (!result.available)
          return setForecastMeta(result.message || "Forecast unavailable");
        (map.getSource("mosquito-forecast") as GeoJSONSource).setData(
          result.data,
        );
        const demo = result.demonstrationData ? " Demonstration data." : "";
        const beta =
          result.modelStatus === "beta"
            ? " Beta weather-only model; not trained from user reports."
            : "";
        setForecastMeta(
          `Experimental forecast updated ${new Date(result.generatedAt).toLocaleDateString()}.${beta}${demo}`,
        );
      } catch {
        setForecastMeta("Experimental forecast unavailable");
      }
    }

    void startMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      cleanupProtocol?.();
    };
  }, [mapConfig]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("campgrounds")) return;
    fetch(`/api/map/campgrounds?period=${period}`)
      .then((response) => response.json())
      .then((data) => {
        allCampgrounds.current = data;
        (map.getSource("campgrounds") as GeoJSONSource).setData(data);
        setSelected(null);
      })
      .catch(() =>
        setStatus("Campground reports are temporarily unavailable."),
      );
  }, [period]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("mosquito-forecast-heat"))
      map.setLayoutProperty(
        "mosquito-forecast-heat",
        "visibility",
        forecastOn ? "visible" : "none",
      );
  }, [forecastOn]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("campgrounds") as GeoJSONSource | undefined;
    if (!source) return;
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? {
          ...allCampgrounds.current,
          features: allCampgrounds.current.features.filter(
            (feature: {
              properties?: { name?: string; city?: string; region?: string };
            }) =>
              [
                feature.properties?.name,
                feature.properties?.city,
                feature.properties?.region,
              ].some((value) => value?.toLowerCase().includes(normalized)),
          ),
        }
      : allCampgrounds.current;
    source.setData(filtered);
    setStatus(`${filtered.features.length} matching campgrounds`);
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
        <div className="segmented" aria-label="Campground rating period">
          <button
            className={period === "recent" ? "active" : ""}
            onClick={() => setPeriod("recent")}
            aria-pressed={period === "recent"}
          >
            Past 30 Days
          </button>
          <button
            className={period === "historical" ? "active" : ""}
            onClick={() => setPeriod("historical")}
            aria-pressed={period === "historical"}
          >
            Historical
          </button>
        </div>
        <label className="forecast-toggle">
          <input
            type="checkbox"
            checked={forecastOn}
            onChange={(event) => setForecastOn(event.target.checked)}
          />
          <span>Forecast</span>
        </label>
        <button className="map-action" type="button" onClick={searchThisArea}>
          Search this area
        </button>
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
        <p>
          <b className="heat-swatch" /> Beta weather suitability forecast, not
          direct observations or camper reports
        </p>
        <small>{forecastMeta}</small>
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
          <p className="eyebrow">Actual camper reports</p>
          <h2>{selected.name}</h2>
          <p>
            {selected.city}, {selected.region}
          </p>
          <div className="rating-summary-grid">
            <div>
              <span>Past 30 Days</span>
              <strong>
                {selected.recent_average
                  ? Number(selected.recent_average).toFixed(1)
                  : "No reports"}
              </strong>
              <small>{selected.recent_count} reports</small>
            </div>
            <div>
              <span>Historical</span>
              <strong>
                {selected.historical_average
                  ? Number(selected.historical_average).toFixed(1)
                  : "No reports"}
              </strong>
              <small>{selected.historical_count} reports</small>
            </div>
          </div>
          <p className="severity-line">
            <i style={{ background: String(selected.marker_color) }} />
            Current marker: {selected.severity_label}
          </p>
          <p className="recent-line">
            Most recent:{" "}
            {selected.most_recent_report_at
              ? new Date(
                  String(selected.most_recent_report_at),
                ).toLocaleDateString()
              : "No published reports"}
          </p>
          <details>
            <summary className="button primary">Submit a report</summary>
            <ReportForm campgroundId={String(selected.id)} compact />
          </details>
          <Link
            className="button secondary"
            href={`/campgrounds/${selected.slug}`}
          >
            View full campground page
          </Link>
        </aside>
      ) : null}
    </section>
  );
}
