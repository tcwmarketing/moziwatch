import { markerStateForAverage } from "@/config/ratings";

export function RatingCard({
  title,
  average,
  count,
}: {
  title: string;
  average: number | null;
  count: number;
}) {
  const state = markerStateForAverage(average);
  return (
    <article className="rating-card">
      <p>{title}</p>
      <div>
        <strong>{average === null ? "No reports" : average.toFixed(1)}</strong>
        <i style={{ background: state.color }} />
      </div>
      <span>{state.label}</span>
      <small>
        {count} {count === 1 ? "report" : "reports"}
      </small>
    </article>
  );
}
