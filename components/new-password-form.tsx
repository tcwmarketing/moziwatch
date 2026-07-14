"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function NewPasswordForm() {
  const token = useSearchParams().get("token") || "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="auth-card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!token) return setMessage("This reset link is missing or invalid.");
        setBusy(true);
        const password = String(
          new FormData(event.currentTarget).get("password"),
        );
        const result = await authClient.resetPassword({
          newPassword: password,
          token,
        });
        setMessage(
          result.error
            ? "This reset link is invalid or expired."
            : "Password updated. You can now sign in.",
        );
        setBusy(false);
      }}
    >
      <p className="eyebrow">Secure account recovery</p>
      <h1>Choose a new password.</h1>
      <label>
        New password
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
      </label>
      <small>Use at least 12 characters.</small>
      <button className="button primary" disabled={busy || !token}>
        {busy ? "Updating..." : "Update password"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
