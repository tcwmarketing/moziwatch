import type { CSSProperties } from "react";
import { forecastDisplayState } from "@/config/forecast-display";

export function ForecastCard({
  score,
  level,
  confidence,
}: {
  score: number | null;
  level: string | null;
  confidence: number | null;
}) {
  const available = score !== null && Number.isFinite(score);
  const normalizedScore = available ? Math.max(0, Math.min(1, score)) : null;
  const state = forecastDisplayState(normalizedScore, level);
  const normalizedConfidence =
    confidence !== null && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : null;

  return (
    <article
      className="rating-card forecast-card"
      style={{ "--forecast-color": state.color } as CSSProperties}
    >
      <p>Today&apos;s forecast</p>
      <div>
        <strong>{available ? level || state.label : "Unavailable"}</strong>
        <i aria-hidden="true" />
      </div>
      <span>
        {normalizedScore === null
          ? "No outlook published"
          : `${Math.round(normalizedScore * 100)}/100`}
      </span>
      <small>
        {normalizedConfidence === null
          ? "Modeled outlook, not a camper rating"
          : `${Math.round(normalizedConfidence * 100)}% confidence · modeled outlook`}
      </small>
    </article>
  );
}
