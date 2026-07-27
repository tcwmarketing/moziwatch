import type { ExpressionSpecification } from "maplibre-gl";

export const FORECAST_BORDER_MIN_ZOOM = 9;

export const FORECAST_BORDER_COLOR_EXPRESSION = [
  "step",
  ["zoom"],
  "#ffffff",
  FORECAST_BORDER_MIN_ZOOM,
  [
    "case",
    ["==", ["get", "forecast_available"], true],
    ["get", "forecast_color"],
    "#ffffff",
  ],
] as ExpressionSpecification;

export const FORECAST_BORDER_WIDTH_EXPRESSION = [
  "step",
  ["zoom"],
  1.5,
  FORECAST_BORDER_MIN_ZOOM,
  ["case", ["==", ["get", "forecast_available"], true], 4, 1.5],
] as ExpressionSpecification;

const FORECAST_DISPLAY_STATES = [
  { maximum: 0.15, label: "None or minimal", color: "#2F7D58" },
  { maximum: 0.35, label: "Light", color: "#6F8F3D" },
  { maximum: 0.55, label: "Moderate", color: "#B88600" },
  { maximum: 0.75, label: "Heavy", color: "#C95620" },
  { maximum: 1, label: "Severe", color: "#8F2D2D" },
] as const;

const UNAVAILABLE_FORECAST_STATE = {
  label: "Unavailable",
  color: "#7B8580",
} as const;

export function forecastDisplayStateForScore(score: number | null) {
  return forecastDisplayState(score, null);
}

export function forecastDisplayState(
  score: number | null,
  level: string | null,
) {
  if (score === null || !Number.isFinite(score))
    return UNAVAILABLE_FORECAST_STATE;
  const displayLabel = level?.trim() || "";
  const normalizedLevel = displayLabel.toLowerCase();
  if (normalizedLevel) {
    if (normalizedLevel === "very high" || normalizedLevel === "severe")
      return { label: displayLabel, color: "#8F2D2D" };
    if (normalizedLevel === "high" || normalizedLevel === "heavy")
      return { label: displayLabel, color: "#C95620" };
    if (normalizedLevel === "moderate")
      return { label: displayLabel, color: "#B88600" };
    if (normalizedLevel === "light" || normalizedLevel === "low")
      return { label: displayLabel, color: "#6F8F3D" };
    if (
      normalizedLevel === "none" ||
      normalizedLevel === "minimal" ||
      normalizedLevel === "none or minimal"
    )
      return { label: displayLabel, color: "#2F7D58" };
  }
  const normalized = Math.max(0, Math.min(1, score));
  return (
    FORECAST_DISPLAY_STATES.find((state) => normalized <= state.maximum) ??
    FORECAST_DISPLAY_STATES[FORECAST_DISPLAY_STATES.length - 1]
  );
}
