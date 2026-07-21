"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function PasswordSettings({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") || "");
    const newPassword = String(data.get("newPassword") || "");
    const confirmation = String(data.get("confirmPassword") || "");
    if (newPassword !== confirmation) {
      setMessage("The new passwords do not match.");
      setBusy(false);
      return;
    }
    const result = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    });
    if (result.error) {
      setMessage(
        "The password could not be changed. Check your current password or send yourself a reset link.",
      );
    } else {
      form.reset();
      setMessage("Password updated. Other signed-in sessions were logged out.");
    }
    setBusy(false);
  }

  async function sendResetLink() {
    setBusy(true);
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setMessage(
      "If the account supports password sign-in, a reset link has been sent.",
    );
    setBusy(false);
  }

  return (
    <div className="password-settings">
      <form onSubmit={changePassword}>
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Please wait…" : "Change password"}
        </button>
      </form>
      <div className="password-reset-option">
        <p>Forgot your current password or signed up another way?</p>
        <button
          className="button secondary"
          type="button"
          onClick={sendResetLink}
          disabled={busy}
        >
          Send password reset link
        </button>
      </div>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
