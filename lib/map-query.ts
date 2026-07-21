export const MAP_CLUSTER_MAX_ZOOM = 8;
export const MAP_CLUSTER_MIN_COUNT = 4;

export type MapLocationScope = "verified" | "all";

export function mapLocationScope(value: string | null): MapLocationScope {
  return value === "all" ? "all" : "verified";
}

export type MapViewport = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export function mapClusterCellSizeDegrees(zoom: number) {
  return Math.max(0.04, Math.min(45, 360 / 2 ** (Math.floor(zoom) + 3)));
}

export function shouldGroupMapLocations(count: number) {
  return Number.isFinite(count) && count >= MAP_CLUSTER_MIN_COUNT;
}

export function mapViewportCovers(outer: MapViewport, inner: MapViewport) {
  return (
    outer.west <= inner.west &&
    outer.south <= inner.south &&
    outer.east >= inner.east &&
    outer.north >= inner.north
  );
}
