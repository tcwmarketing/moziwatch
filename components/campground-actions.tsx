"use client";

import { useEffect, useRef, useState } from "react";
import { AuthForm } from "@/components/auth-form";
import { LocationSuggestionForm } from "@/components/location-suggestion-form";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5S3.5 15.2 3.5 8.7A4.7 4.7 0 0 1 12 5.9a4.7 4.7 0 0 1 8.5 2.8C20.5 15.2 12 20.5 12 20.5Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function closeOnBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
  if (event.target === event.currentTarget) event.currentTarget.close();
}

export function CampgroundActions({
  campgroundId,
  campgroundName,
  campgroundSlug,
  country,
  region,
  locality,
  initialSaved,
  signedIn,
  saveOnLoad = false,
}: {
  campgroundId: string;
  campgroundName: string;
  campgroundSlug: string;
  country: string;
  region: string;
  locality: string;
  initialSaved: boolean;
  signedIn: boolean;
  saveOnLoad?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [authenticated, setAuthenticated] = useState(signedIn);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const signInDialog = useRef<HTMLDialogElement>(null);
  const correctionDialog = useRef<HTMLDialogElement>(null);

  async function persistSaved(next: boolean) {
    const response = await fetch(`/api/saved-campgrounds/${campgroundId}`, {
      method: next ? "POST" : "DELETE",
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (response?.status === 401) {
      setAuthenticated(false);
      signInDialog.current?.showModal();
      throw new Error("Sign in to save this campground.");
    }
    if (!response?.ok)
      throw new Error("Could not update your saved campgrounds.");
  }

  async function toggleSaved() {
    if (busy) return;
    if (!authenticated) {
      signInDialog.current?.showModal();
      return;
    }
    const previous = saved;
    const next = !previous;
    setSaved(next);
    setMessage(next ? "Saved." : "Removed.");
    setBusy(true);
    try {
      await persistSaved(next);
    } catch (error) {
      setSaved(previous);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update your saved campgrounds.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAfterSignIn() {
    setAuthenticated(true);
    setSaved(true);
    setMessage("Saved.");
    setBusy(true);
    try {
      await persistSaved(true);
      signInDialog.current?.close();
    } catch {
      setSaved(false);
      setMessage("Signed in, but the campground could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!saveOnLoad || !signedIn || initialSaved) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setBusy(true);
      try {
        await persistSaved(true);
        if (cancelled) return;
        setSaved(true);
        setMessage("Saved.");
        const url = new URL(window.location.href);
        url.searchParams.delete("save");
        window.history.replaceState({}, "", `${url.pathname}${url.search}`);
      } catch {
        if (!cancelled) setMessage("The campground could not be saved.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // The intent is consumed only once after an external sign-in redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="campground-actions">
        <div className="campground-action-buttons">
          <button
            className={`icon-action ${saved ? "is-saved" : ""}`}
            type="button"
            disabled={busy}
            aria-busy={busy}
            aria-pressed={saved}
            aria-label={
              saved ? "Remove from saved campgrounds" : "Save campground"
            }
            onClick={toggleSaved}
          >
            <HeartIcon filled={saved} />
            <span>{busy ? "Saving..." : saved ? "Saved" : "Save"}</span>
          </button>
          <button
            className="button secondary compact-button"
            type="button"
            onClick={() => correctionDialog.current?.showModal()}
          >
            Suggest an edit
          </button>
        </div>
        {message ? <small role="status">{message}</small> : null}
      </div>

      <dialog
        className="site-dialog"
        ref={signInDialog}
        onClick={closeOnBackdrop}
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close"
          onClick={() => signInDialog.current?.close()}
        >
          ×
        </button>
        <AuthForm
          mode={authMode}
          embedded
          callbackURL={`/campgrounds/${campgroundSlug}?save=1`}
          onSignedIn={saveAfterSignIn}
          onModeChange={setAuthMode}
        />
      </dialog>

      <dialog
        className="site-dialog correction-dialog"
        ref={correctionDialog}
        onClick={closeOnBackdrop}
      >
        <button
          className="dialog-close"
          type="button"
          aria-label="Close"
          onClick={() => correctionDialog.current?.close()}
        >
          ×
        </button>
        <p className="eyebrow">Help improve this listing</p>
        <h2>Suggest a correction</h2>
        <p>
          Corrections enter moderation and never change a campground
          immediately.
        </p>
        <LocationSuggestionForm
          campgroundId={campgroundId}
          defaultName={campgroundName}
          defaultCountry={country}
          defaultRegion={region}
          defaultLocality={locality}
        />
      </dialog>
    </>
  );
}
