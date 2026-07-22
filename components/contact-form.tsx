"use client";

import { useState } from "react";
import { createRecaptchaToken } from "@/lib/recaptcha-client";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

export function ContactForm({ formProof }: { formProof: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const botToken = await createRecaptchaToken(RECAPTCHA_ACTIONS.contact);
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          subject: data.get("subject"),
          message: data.get("message"),
          website: data.get("website"),
          formProof,
          botToken,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        message?: string;
        error?: string;
      } | null;
      setMessage(
        result?.message || result?.error || "Your message could not be sent.",
      );
      if (response.ok) form.reset();
    } catch {
      setMessage(
        "The anti-bot check could not be loaded. Please refresh and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="contact-form content-card" onSubmit={submit}>
      <div className="contact-form-grid">
        <label>
          Name
          <input name="name" autoComplete="name" maxLength={80} required />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
      </div>
      <label>
        What is this about?
        <select name="subject" defaultValue="General question" required>
          <option>General question</option>
          <option>Campground listing</option>
          <option>Mosquito report</option>
          <option>Products or partnership</option>
          <option>Privacy request</option>
          <option>Something else</option>
        </select>
      </label>
      <div className="contact-honeypot" aria-hidden="true">
        <label>
          Leave this field blank
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label>
        Message
        <textarea
          name="message"
          minLength={10}
          maxLength={3000}
          rows={8}
          required
        />
      </label>
      <div className="contact-form-submit">
        <small>Your message will be reviewed by the MoziWatch team.</small>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send message"}
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
