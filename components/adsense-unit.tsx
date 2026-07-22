"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[];
  }
}

const ADSENSE_CLIENT = "ca-pub-8746662508326131";
const MOZITOP_SLOT = "6407699046";

export function AdsenseUnit({ className = "" }: { className?: string }) {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      (window.adsbygoogle ||= []).push({});
    } catch (error) {
      console.warn("AdSense unit could not be initialized", error);
    }
  }, []);

  return (
    <div
      className={`adsense-placement ${className}`.trim()}
      aria-label="Advertisement"
    >
      <span>Advertisement</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={MOZITOP_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
