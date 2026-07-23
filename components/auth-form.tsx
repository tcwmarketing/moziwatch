"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

const facebookSignInEnabled =
  process.env.NEXT_PUBLIC_FACEBOOK_SIGN_IN_ENABLED === "true";

function SocialIcon({ provider }: { provider: "google" | "facebook" }) {
  if (provider === "facebook")
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#1877f2"
          d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.03 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.69.24 2.69.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07Z"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.65Z"
      />
      <path
        fill="#34a853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3A7.2 7.2 0 0 1 5.35 14.3H1.34v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#fbbc05"
        d="M5.35 14.3A7.21 7.21 0 0 1 5 12c0-.8.14-1.57.35-2.3V6.61H1.34A12 12 0 0 0 0 12c0 1.94.46 3.77 1.34 5.39l4.01-3.09Z"
      />
      <path
        fill="#ea4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.44-3.45A11.55 11.55 0 0 0 12 0 12 12 0 0 0 1.34 6.61l4.01 3.09A7.2 7.2 0 0 1 12 4.77Z"
      />
    </svg>
  );
}

export function AuthForm({
  mode,
  embedded = false,
  callbackURL = "/dashboard",
  initialMessage = "",
  onSignedIn,
  onModeChange,
}: {
  mode: "sign-in" | "sign-up";
  embedded?: boolean;
  callbackURL?: string;
  initialMessage?: string;
  onSignedIn?: () => void | Promise<void>;
  onModeChange?: (mode: "sign-in" | "sign-up") => void;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    if (mode === "sign-up") {
      const result = await authClient.signUp.email({
        name: String(form.get("name")),
        email,
        password,
        callbackURL,
      });
      setMessage(
        result.error
          ? "We could not create the account. Check the details or try signing in."
          : "Check your email for a verification link before signing in.",
      );
    } else {
      const result = await authClient.signIn.email({
        email,
        password,
        ...(embedded ? {} : { callbackURL }),
      });
      setMessage(
        result.error
          ? "The email or password was not accepted. Your email may still need verification."
          : "Signed in. Redirecting...",
      );
      if (!result.error) {
        if (onSignedIn) await onSignedIn();
        else window.location.href = callbackURL;
      }
    }
    setBusy(false);
  }

  async function social(provider: "google" | "facebook") {
    await authClient.signIn.social({ provider, callbackURL });
  }

  return (
    <div className={`auth-card ${embedded ? "embedded" : ""}`}>
      <p className="eyebrow">
        {mode === "sign-up" ? "Create an account" : "Welcome back"}
      </p>
      <h1>
        {mode === "sign-up"
          ? "Save campgrounds and track reports."
          : "Sign in to your campground list."}
      </h1>
      <div className="social-buttons">
        <button
          className="button social"
          onClick={() => social("google")}
          type="button"
        >
          <SocialIcon provider="google" />
          Continue with Google
        </button>
        {facebookSignInEnabled ? (
          <button
            className="button social"
            onClick={() => social("facebook")}
            type="button"
          >
            <SocialIcon provider="facebook" />
            Continue with Facebook
          </button>
        ) : null}
      </div>
      <div className="or">
        <span>or use email</span>
      </div>
      <form onSubmit={submit}>
        {mode === "sign-up" ? (
          <label>
            First name or nickname
            <input name="name" autoComplete="name" required maxLength={80} />
          </label>
        ) : null}
        <label>
          Email
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            required
            minLength={12}
            maxLength={128}
          />
        </label>
        {mode === "sign-up" ? (
          <small>
            Use at least 12 characters. We collect only your name and email.
          </small>
        ) : (
          <Link className="text-link" href="/forgot-password">
            Forgot password?
          </Link>
        )}
        <button className="button primary" disabled={busy}>
          {busy
            ? "Please wait..."
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>
      {message ? (
        <p className="form-message" role="status">
          {message}
        </p>
      ) : null}
      <p>
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            {onModeChange ? (
              <button
                className="text-link link-button"
                type="button"
                onClick={() => onModeChange("sign-in")}
              >
                Sign in
              </button>
            ) : (
              <Link className="text-link" href="/sign-in">
                Sign in
              </Link>
            )}
          </>
        ) : (
          <>
            New here?{" "}
            {onModeChange ? (
              <button
                className="text-link link-button"
                type="button"
                onClick={() => onModeChange("sign-up")}
              >
                Create an account
              </button>
            ) : (
              <Link className="text-link" href="/sign-up">
                Create an account
              </Link>
            )}
          </>
        )}
      </p>
    </div>
  );
}
