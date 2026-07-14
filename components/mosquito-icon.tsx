import { useId } from "react";

export function MosquitoIcon({
  crossedOut = false,
  className = "",
}: {
  crossedOut?: boolean;
  className?: string;
}) {
  const titleId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{crossedOut ? "No mosquitoes" : "Mosquito"}</title>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      >
        <ellipse cx="25" cy="23" rx="3.2" ry="7" fill="currentColor" />
        <circle cx="25" cy="14" r="2.4" fill="currentColor" />
        <path d="m25 11 1-5M27 13l5-3M22 18c-7-8-14-7-14-2 0 4 7 7 14 7M28 18c6-8 13-7 13-2 0 4-6 7-13 7M22 22l-9 8M28 22l9 8M23 27l-6 10M27 27l6 10M25 30v9" />
      </g>
      {crossedOut ? (
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      ) : null}
      {crossedOut ? (
        <path
          d="M10 10l28 28"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
