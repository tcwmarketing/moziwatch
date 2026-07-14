"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function AccountActions({
  email,
  emailVerified,
}: {
  email: string;
  emailVerified: boolean;
}) {
  const [message, setMessage] = useState("");
  async function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account? Your reports will remain, but they will be permanently disconnected from your account.",
      )
    )
      return;
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) return setMessage("The account could not be deleted.");
    window.location.href = "/";
  }
  return (
    <div className="account-actions">
      {!emailVerified ? (
        <button
          className="button secondary"
          onClick={async () => {
            const result = await authClient.sendVerificationEmail({
              email,
              callbackURL: "/dashboard",
            });
            setMessage(
              result.error
                ? "The verification message could not be sent."
                : "A fresh verification link has been sent.",
            );
          }}
        >
          Resend verification
        </button>
      ) : null}
      <button
        className="button secondary"
        onClick={() =>
          authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/";
              },
            },
          })
        }
      >
        Log out
      </button>
      <button className="button danger" onClick={deleteAccount}>
        Delete account
      </button>
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}
