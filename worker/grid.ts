export type GridCell = {
  key: string;
  latitude: number;
  longitude: number;
  geojson: { type: "Polygon"; coordinates: number[][][] };
};

export function createNorthAmericaGrid(
  step = Number(process.env.FORECAST_GRID_DEGREES || 2.5),
) {
  if (!Number.isFinite(step) || step < 0.25 || step > 5)
    throw new Error("FORECAST_GRID_DEGREES must be between 0.25 and 5");
  const cells: GridCell[] = [];
  // Broad Phase 1 coverage for Canada, the contiguous US and Alaska. Coastal
  // ocean cells are harmless and can later be replaced by a land-mask adapter.
  const bounds = [
    { west: -141, east: -52, south: 41, north: 72 },
    { west: -125, east: -66, south: 25, north: 49 },
    { west: -168, east: -130, south: 52, north: 72 },
  ];
  const seen = new Set<string>();
  for (const bound of bounds) {
    for (
      let latitude = bound.south + step / 2;
      latitude < bound.north;
      latitude += step
    ) {
      for (
        let longitude = bound.west + step / 2;
        longitude < bound.east;
        longitude += step
      ) {
        const key = `${latitude.toFixed(3)}:${longitude.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const west = longitude - step / 2,
          east = longitude + step / 2,
          south = latitude - step / 2,
          north = latitude + step / 2;
        cells.push({
          key,
          latitude,
          longitude,
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south],
              ],
            ],
          },
        });
      }
    }
  }
  return cells;
}
