"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function PasswordReset() {
  const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setMessage("If an account matches that email, a reset link has been sent.");
  }
  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="eyebrow">Password reset</p>
      <h1>Get a secure reset link.</h1>
      <label>
        Email
        <input name="email" type="email" required />
      </label>
      <button className="button primary">Send reset link</button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
