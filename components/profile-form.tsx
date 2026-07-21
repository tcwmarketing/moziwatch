"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  HomeCityAutocomplete,
  type SelectedHomeCity,
} from "@/components/home-city-autocomplete";

export function ProfileForm({
  initialName,
  initialEmail,
  initialHomeCity,
  initialHomeCitySelection,
}: {
  initialName: string;
  initialEmail: string;
  initialHomeCity: string;
  initialHomeCitySelection: SelectedHomeCity | null;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [homeCitySelection, setHomeCitySelection] =
    useState<SelectedHomeCity | null>(initialHomeCitySelection);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const email = String(form.get("email") || "")
      .trim()
      .toLowerCase();
    const homeCity = String(form.get("homeCity") || "").trim();
    if (homeCity && !homeCitySelection) {
      setMessage("Select your home city from the suggestions.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          homeCity: homeCitySelection
            ? {
                ...homeCitySelection,
                label: homeCitySelection.label,
              }
            : null,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok)
        throw new Error(result?.error || "Profile details could not be saved.");

      if (email !== initialEmail.toLowerCase()) {
        const emailChange = await authClient.changeEmail({
          newEmail: email,
          callbackURL: "/dashboard",
        });
        if (emailChange.error)
          throw new Error(
            "Your name and city were saved, but the email change could not be started.",
          );
        setMessage(
          "Profile saved. Check your current email to approve the new sign-in address.",
        );
      } else {
        setMessage("Profile saved.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Profile details could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="profile-form" onSubmit={submit}>
      <label>
        Name
        <input
          name="name"
          defaultValue={initialName}
          autoComplete="name"
          required
          maxLength={80}
        />
      </label>
      <label>
        Email
        <input
          name="email"
          defaultValue={initialEmail}
          type="email"
          autoComplete="email"
          required
        />
      </label>
      <div className="profile-field">
        <label htmlFor="profile-home-city">Home city</label>
        <HomeCityAutocomplete
          initial={
            initialHomeCitySelection ||
            (initialHomeCity
              ? {
                  id: "existing",
                  city: initialHomeCity.split(",")[0] || initialHomeCity,
                  region: "",
                  country: "",
                  label: initialHomeCity,
                  latitude: 0,
                  longitude: 0,
                }
              : null)
          }
          onSelect={setHomeCitySelection}
        />
      </div>
      <button className="button primary" type="submit" disabled={busy}>
        {busy ? "Saving..." : "Save profile"}
      </button>
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
