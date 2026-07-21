"use client";

import { useEffect } from "react";

export function ForecastInterestBeacon({
  campgroundId,
}: {
  campgroundId: string;
}) {
  useEffect(() => {
    const key = `moziwatch:forecast-view:${campgroundId}:${new Date().toISOString().slice(0, 10)}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    void fetch("/api/forecast/interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campgroundId }),
      keepalive: true,
    });
  }, [campgroundId]);
  return null;
}
