"use client";

import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

export function CampgroundMiniMap({
  latitude,
  longitude,
  styleUrl,
  apiKey,
}: {
  latitude: number;
  longitude: number;
  styleUrl: string;
  apiKey: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  useEffect(() => {
    if (!container.current || mapRef.current || !apiKey) return;
    let disposed = false;
    import("maplibre-gl").then((maplibre) => {
      if (disposed || !container.current) return;
      const map = new maplibre.Map({
        container: container.current,
        style: styleUrl.replace("{key}", encodeURIComponent(apiKey)),
        center: [longitude, latitude],
        zoom: 10,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibre.AttributionControl({ compact: true }));
      map.on("load", () => {
        map.addSource("campground-location", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "Point", coordinates: [longitude, latitude] },
            properties: {},
          },
        });
        map.addLayer({
          id: "campground-location",
          type: "circle",
          source: "campground-location",
          paint: {
            "circle-radius": 9,
            "circle-color": "#173f35",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 3,
          },
        });
      });
    });
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [apiKey, latitude, longitude, styleUrl]);
  return (
    <div className="mini-map" ref={container}>
      {!apiKey ? (
        <p>Configure a Protomaps API key to display this map.</p>
      ) : null}
    </div>
  );
}
