"use client";

import { useState } from "react";
import { createRecaptchaToken } from "@/lib/recaptcha-client";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

export function LocationSuggestionForm({
  campgroundId,
  defaultName = "",
  defaultCountry = "",
  defaultRegion = "",
  defaultLocality = "",
}: {
  campgroundId?: string;
  defaultName?: string;
  defaultCountry?: string;
  defaultRegion?: string;
  defaultLocality?: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const botToken = await createRecaptchaToken(
        RECAPTCHA_ACTIONS.locationSuggestion,
      );
      const response = await fetch("/api/location-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campgroundId,
          kind: campgroundId ? "correction" : "missing",
          name: form.get("name"),
          country: form.get("country"),
          region: form.get("region"),
          locality: form.get("locality"),
          comment: form.get("comment"),
          email: form.get("email"),
          botToken,
        }),
      });
      const result = await response.json();
      setMessage(
        result.message || result.error || "The suggestion could not be sent.",
      );
      if (response.ok) event.currentTarget.reset();
    } catch {
      setMessage(
        "The anti-bot check could not be loaded. Please refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="suggestion-form" onSubmit={submit}>
      <div className="suggestion-field">
        <label htmlFor="suggestion-name">Campground name</label>
        <input
          id="suggestion-name"
          name="name"
          defaultValue={defaultName}
          required
        />
      </div>
      <div className="suggestion-grid">
        <div className="suggestion-field">
          <label htmlFor="suggestion-country">Country</label>
          <select
            id="suggestion-country"
            name="country"
            defaultValue={defaultCountry || "CA"}
            required
          >
            <option value="CA">Canada</option>
            <option value="US">United States</option>
          </select>
        </div>
        <div className="suggestion-field">
          <label htmlFor="suggestion-region">Province or state</label>
          <input
            id="suggestion-region"
            name="region"
            defaultValue={defaultRegion}
            required
          />
        </div>
      </div>
      <div className="suggestion-field">
        <label htmlFor="suggestion-locality">Nearest city or community</label>
        <input
          id="suggestion-locality"
          name="locality"
          defaultValue={defaultLocality}
        />
      </div>
      <div className="suggestion-field suggestion-field-wide">
        <label htmlFor="suggestion-comment">What should we correct?</label>
        <textarea
          id="suggestion-comment"
          name="comment"
          minLength={10}
          maxLength={1500}
          rows={5}
          placeholder="Describe the incorrect information and, if possible, provide the correct details."
          required
        />
        <small>Include a source link when one is available.</small>
      </div>
      <div className="suggestion-field">
        <label htmlFor="suggestion-email">Email for follow-up (optional)</label>
        <input id="suggestion-email" name="email" type="email" />
      </div>
      <div className="suggestion-submit-row">
        <small>Suggestions are reviewed before the listing changes.</small>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Submit correction"}
        </button>
      </div>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}
