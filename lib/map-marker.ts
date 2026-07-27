export const SPLIT_MARKER_IMAGE_SIZE = 48;

type SplitMarkerImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

function normalizeHexColor(color: string) {
  const normalized = color.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized))
    throw new Error(`Unsupported map marker color: ${color}`);
  return normalized;
}

function colorChannels(color: string) {
  const normalized = normalizeHexColor(color);
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ] as const;
}

export function splitMarkerImageId(reportColor: string, forecastColor: string) {
  return `campground-split-${normalizeHexColor(reportColor).slice(1)}-${normalizeHexColor(forecastColor).slice(1)}`;
}

export function createSplitMarkerImage(
  reportColor: string,
  forecastColor: string,
): SplitMarkerImage {
  const width = SPLIT_MARKER_IMAGE_SIZE;
  const height = SPLIT_MARKER_IMAGE_SIZE;
  const data = new Uint8Array(width * height * 4);
  const report = colorChannels(reportColor);
  const forecast = colorChannels(forecastColor);
  const white = [255, 255, 255] as const;
  const center = (width - 1) / 2;
  const outerRadius = width / 2 - 1;
  const fillRadius = outerRadius - 3;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const distance = Math.hypot(dx, dy);
      if (distance > outerRadius) continue;

      const offset = (y * width + x) * 4;
      const isOutline = distance > fillRadius;
      const isDivider = Math.abs(dx) < 1.5 && distance <= fillRadius;
      const channels =
        isOutline || isDivider ? white : dx < 0 ? report : forecast;

      data[offset] = channels[0];
      data[offset + 1] = channels[1];
      data[offset + 2] = channels[2];
      data[offset + 3] = 255;
    }
  }

  return { width, height, data };
}
