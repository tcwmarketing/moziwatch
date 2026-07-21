import { MosquitoIcon } from "./mosquito-icon";

export function MosquitoRating({
  average,
  color,
}: {
  average: number | null;
  color: string;
}) {
  const label =
    average === null
      ? "No mosquito reports"
      : `Mosquito severity ${average.toFixed(1)} out of 5`;
  const ratingColor = color.toLowerCase() === "#e1b93f" ? "#765800" : color;
  const iconCount =
    average === null ? 0 : Math.max(1, Math.min(5, Math.round(average)));

  return (
    <span className="directory-mosquito-rating" aria-label={label}>
      <span
        className="directory-mosquito-icons"
        style={{ color: ratingColor }}
        aria-hidden="true"
      >
        {Array.from({ length: iconCount }, (_, index) => (
          <MosquitoIcon key={index} />
        ))}
      </span>
      <strong className="directory-rating-value">
        {average === null ? "No reports" : average.toFixed(1)}
      </strong>
    </span>
  );
}
