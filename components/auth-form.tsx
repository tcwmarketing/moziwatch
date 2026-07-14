"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [message, setMessage] = useState("");
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
        callbackURL: "/dashboard",
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
        callbackURL: "/dashboard",
      });
      setMessage(
        result.error
          ? "The email or password was not accepted. Your email may still need verification."
          : "Signed in. Redirecting...",
      );
      if (!result.error) window.location.href = "/dashboard";
    }
    setBusy(false);
  }

  async function social(provider: "google" | "facebook") {
    await authClient.signIn.social({ provider, callbackURL: "/dashboard" });
  }

  return (
    <div className="auth-card">
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
          Continue with Google
        </button>
        <button
          className="button social"
          onClick={() => social("facebook")}
          type="button"
        >
          Continue with Facebook
        </button>
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
            <Link className="text-link" href="/sign-in">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="text-link" href="/sign-up">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
