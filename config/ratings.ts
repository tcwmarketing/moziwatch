export const RATING_CHOICES = [
  { value: 1, label: "No mosquitoes", shortLabel: "None" },
  { value: 2, label: "Light", shortLabel: "Light" },
  { value: 3, label: "Moderate", shortLabel: "Moderate" },
  { value: 4, label: "Heavy", shortLabel: "Heavy" },
  { value: 5, label: "Severe", shortLabel: "Severe" },
] as const;

export type RatingValue = (typeof RATING_CHOICES)[number]["value"];

export const MARKER_STATES = [
  {
    key: "none",
    label: "No recent reports",
    min: null,
    max: null,
    color: "#7B8580",
  },
  {
    key: "low",
    label: "No mosquitoes to light",
    min: 1,
    max: 1.99,
    color: "#2F7D58",
  },
  { key: "moderate", label: "Moderate", min: 2, max: 2.99, color: "#E1B93F" },
  { key: "high", label: "Heavy", min: 3, max: 3.99, color: "#D76B2D" },
  { key: "severe", label: "Severe", min: 4, max: 5, color: "#8F2D2D" },
] as const;

export type MarkerState = (typeof MARKER_STATES)[number];

export function markerStateForAverage(average: number | null): MarkerState {
  if (average === null || !Number.isFinite(average)) return MARKER_STATES[0];
  return (
    MARKER_STATES.slice(1).find(
      (state) => average >= (state.min ?? 0) && average <= (state.max ?? 5),
    ) ?? MARKER_STATES[0]
  );
}

export function ratingLabel(value: number): string {
  return (
    RATING_CHOICES.find((choice) => choice.value === value)?.label ?? "Unknown"
  );
}
