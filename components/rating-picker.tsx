"use client";

import { RATING_CHOICES, type RatingValue } from "@/config/ratings";
import { MosquitoIcon } from "./mosquito-icon";

export function RatingPicker({
  value,
  onChange,
}: {
  value: RatingValue | null;
  onChange: (rating: RatingValue) => void;
}) {
  return (
    <fieldset className="rating-picker">
      <legend>How were the mosquitoes?</legend>
      <div className="rating-options">
        {RATING_CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={
              value === choice.value
                ? "rating-choice selected"
                : "rating-choice"
            }
          >
            <input
              type="radio"
              name="rating"
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              aria-label={`${choice.value} of 5: ${choice.label}`}
            />
            <span className="rating-icons" aria-hidden="true">
              {choice.value === 1 ? (
                <MosquitoIcon crossedOut />
              ) : (
                Array.from({ length: choice.value - 1 }, (_, index) => (
                  <MosquitoIcon key={index} />
                ))
              )}
            </span>
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
