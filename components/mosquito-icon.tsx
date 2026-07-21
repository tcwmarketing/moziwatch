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
      viewBox="0 0 576 512"
      role="img"
      aria-labelledby={titleId}
    >
      <title id={titleId}>{crossedOut ? "None" : "Mosquito"}</title>
      {/* Font Awesome Free 7.3.1 by Fonticons, Inc. — mosquito solid icon,
          CC BY 4.0: https://fontawesome.com/license/free */}
      <path
        fill="currentColor"
        d="M178.5 495.2c-7.5 9.6-21 12.1-31.3 5.3S133.5 480 138.9 469l1.2-2.2 36.2-58v-41l.3-4c.6-3.9 2.2-7.7 4.6-10.9l39.3-52.2-66.2 59.5c-17 15.3-39 23.7-61.9 23.8h-8.1C37.8 384 0 346.2 0 299.6c0-43 32.4-79.2 75.1-83.9l130.5-14.5-44.8-38.3-2.4-2.4c-5.3-6-7.3-14.4-5.3-22.3l13.3-53.4-25.9-38.9-1.3-2.1c-5.8-10.8-2.7-24.6 7.4-31.7 10.1-7.1 23.7-5.1 31.4 4.3l1.5 2 32 48 1.4 2.2c2.8 5.3 3.5 11.6 2.1 17.6l-12.3 49.2 53.3 45.7v-28.8c0-11.8 6.5-22.1 16-27.7V64l.3-3.3C273.5 53.4 280 48 287.7 48s14.2 5.5 15.7 12.7l.3 3.2v60.5c9.6 5.5 16 15.8 16 27.7V181l53.4-45.8-12.3-49.2c-1.5-5.9-.7-12.2 2.1-17.6l1.4-2.2 32-48 1.5-2c7.7-9.4 21.3-11.5 31.4-4.3 10.1 7.1 13.1 20.9 7.4 31.7l-1.3 2.1-25.9 38.9 13.3 53.4c2 8-.1 16.3-5.3 22.3l-2.4 2.4-44.7 38.3 130.5 14.5c42.8 4.8 75.1 40.9 75.1 83.9 0 46.6-37.8 84.4-84.4 84.4h-8.1c-22.8 0-44.9-8.5-61.9-23.8l-66.1-59.5 39.2 52.2c2.4 3.2 4 7 4.6 10.9l.3 4v41l36.2 58 1.2 2.1c5.4 11 2 24.7-8.3 31.5s-23.8 4.4-31.3-5.3l-1.4-2-40-64-1.6-3.1c-1.4-3.1-2.1-6.6-2.1-10.1v-39.8l-32.4-43.1v74.7c0 17.7-14.3 32-32 32s-32-14.3-32-32v-74.6l-32.3 43v39.8c0 3.5-.7 6.9-2.1 10.1l-1.6 3.1-40 64-1.4 2z"
      />
      {crossedOut ? (
        <ellipse
          cx="288"
          cy="256"
          rx="256"
          ry="224"
          fill="none"
          stroke="currentColor"
          strokeWidth="34"
        />
      ) : null}
      {crossedOut ? (
        <path
          d="M105 73l366 366"
          fill="none"
          stroke="currentColor"
          strokeWidth="46"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
