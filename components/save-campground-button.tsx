"use client";

import Link from "next/link";
import { useState } from "react";

export function SaveCampgroundButton({
  campgroundId,
  initialSaved,
  signedIn,
}: {
  campgroundId: string;
  initialSaved: boolean;
  signedIn: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!signedIn)
    return (
      <Link className="button secondary compact-button" href="/sign-in">
        Sign in to save
      </Link>
    );

  return (
    <div className="save-control">
      <button
        className="button secondary compact-button"
        type="button"
        disabled={busy}
        aria-pressed={saved}
        onClick={async () => {
          setBusy(true);
          const response = await fetch(
            `/api/saved-campgrounds/${campgroundId}`,
            {
              method: saved ? "DELETE" : "POST",
            },
          );
          if (response.ok) {
            setSaved(!saved);
            setMessage(
              saved
                ? "Removed from saved campgrounds."
                : "Saved to your dashboard.",
            );
          } else {
            setMessage("The saved list could not be updated.");
          }
          setBusy(false);
        }}
      >
        {busy ? "Updating..." : saved ? "Saved" : "Save campground"}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
