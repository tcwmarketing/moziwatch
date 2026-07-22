"use client";

import { useState } from "react";

const amounts = [1, 3, 5, 10];

export function DonationForm() {
  const [selected, setSelected] = useState("3");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function checkout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/donations/checkout", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(event.currentTarget),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;
      if (!response.ok || !result?.url)
        throw new Error(
          result?.error || "Secure checkout could not be opened.",
        );

      window.location.assign(result.url);
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Secure checkout could not be opened.",
      );
      setBusy(false);
    }
  }

  return (
    <form
      className="donation-form content-card"
      method="post"
      action="/api/donations/checkout"
      onSubmit={checkout}
    >
      <fieldset>
        <legend>Choose an amount</legend>
        <div className="donation-amounts">
          {amounts.map((amount) => (
            <label key={amount}>
              <input
                type="radio"
                name="suggestedAmount"
                value={amount}
                checked={selected === String(amount)}
                onChange={(event) => setSelected(event.target.value)}
              />
              <span>${amount}</span>
            </label>
          ))}
          <label>
            <input
              type="radio"
              name="suggestedAmount"
              value="custom"
              checked={selected === "custom"}
              onChange={(event) => setSelected(event.target.value)}
            />
            <span>Other</span>
          </label>
        </div>
      </fieldset>
      {selected === "custom" ? (
        <label className="custom-donation">
          Your amount (CAD)
          <span>
            <b>$</b>
            <input
              name="customAmount"
              type="number"
              min="1"
              max="500"
              step="1"
              required
            />
          </span>
        </label>
      ) : null}
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Opening secure checkout…" : "Continue to secure checkout"}
      </button>
      {error ? (
        <p className="form-message" role="alert">
          {error}
        </p>
      ) : null}
      <div className="donation-assurances" aria-label="Donation assurances">
        <span>Secure Stripe checkout</span>
        <span>One-time donation</span>
        <span>No account required</span>
      </div>
    </form>
  );
}
