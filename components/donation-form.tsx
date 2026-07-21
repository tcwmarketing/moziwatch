"use client";

import { useState } from "react";

const amounts = [1, 3, 5, 10];

export function DonationForm() {
  const [selected, setSelected] = useState("3");
  return (
    <form
      className="donation-form content-card"
      method="post"
      action="/api/donations/checkout"
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
      <button className="button primary" type="submit">
        Continue to secure checkout
      </button>
      {process.env.NODE_ENV !== "production" ? (
        <small>
          Stripe test mode is active. No real charge will be made while the
          donation flow is being tested.
        </small>
      ) : null}
    </form>
  );
}
