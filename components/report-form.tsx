"use client";

import { useState } from "react";
import type { RatingValue } from "@/config/ratings";
import { RatingPicker } from "./rating-picker";

export function ReportForm({
  campgroundId,
  compact = false,
}: {
  campgroundId: string;
  compact?: boolean;
}) {
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [comment, setComment] = useState("");
  const [observationMode, setObservationMode] = useState<"recent" | "older">(
    "recent",
  );
  const [observedOn, setObservedOn] = useState("");
  const [state, setState] = useState<{
    kind: "idle" | "saving" | "success" | "error";
    message?: string;
  }>({ kind: "idle" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rating)
      return setState({
        kind: "error",
        message: "Choose the condition you observed.",
      });
    setState({ kind: "saving" });
    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campgroundId,
        rating,
        comment,
        observationMode,
        observedOn: observationMode === "older" ? observedOn : undefined,
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok)
      return setState({
        kind: "error",
        message: result.error || "The report could not be saved.",
      });
    setState({
      kind: "success",
      message: "Thanks. Your campground report is now included.",
    });
    setComment("");
    setObservationMode("recent");
    setObservedOn("");
  }

  return (
    <form
      className={compact ? "report-form compact" : "report-form"}
      onSubmit={submit}
    >
      <RatingPicker value={rating} onChange={setRating} />
      <fieldset className="report-date-fieldset">
        <legend>When did you observe this?</legend>
        <label>
          <input
            type="radio"
            name={`observation-mode-${campgroundId}`}
            value="recent"
            checked={observationMode === "recent"}
            onChange={() => setObservationMode("recent")}
          />
          <span>
            <strong>Recent</strong>
            <small>
              Choose this whenever the experience still feels recent to you. It
              will be recorded as today.
            </small>
          </span>
        </label>
        <label>
          <input
            type="radio"
            name={`observation-mode-${campgroundId}`}
            value="older"
            checked={observationMode === "older"}
            onChange={() => setObservationMode("older")}
          />
          <span>
            <strong>Older date</strong>
            <small>Use the date the campground conditions were observed.</small>
          </span>
        </label>
        {observationMode === "older" ? (
          <label
            className="older-report-date"
            htmlFor={`observed-on-${campgroundId}`}
          >
            Observation date
            <input
              id={`observed-on-${campgroundId}`}
              type="date"
              min="2000-01-01"
              max={new Date().toISOString().slice(0, 10)}
              value={observedOn}
              onChange={(event) => setObservedOn(event.target.value)}
              required
            />
          </label>
        ) : null}
      </fieldset>
      <label className="field-label" htmlFor={`comment-${campgroundId}`}>
        Optional note
      </label>
      <textarea
        id={`comment-${campgroundId}`}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={800}
        rows={compact ? 2 : 4}
        placeholder="For example: calm near the water after sunset"
      />
      <div className="form-footer">
        <span>{comment.length}/800</span>
        <button
          className="button primary"
          type="submit"
          disabled={state.kind === "saving"}
        >
          {state.kind === "saving" ? "Saving report..." : "Submit report"}
        </button>
      </div>
      {state.message ? (
        <p className={`form-message ${state.kind}`} role="status">
          {state.message}
        </p>
      ) : null}
      <p className="privacy-note">
        Anonymous reports use a first-party token and a protected IP hash to
        prevent duplicates. Raw IP addresses are never stored.
      </p>
    </form>
  );
}
