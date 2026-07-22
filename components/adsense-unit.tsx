"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    adsbygoogle?: Record<string, never>[];
  }
}

const ADSENSE_CLIENT = "ca-pub-8746662508326131";
const MOZITOP_SLOT = "6407699046";
export const ADSENSE_SCRIPT_URL = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`;

type AdsenseFormat = "auto" | "horizontal" | "rectangle" | "vertical";

export function AdsenseUnit({
  className = "",
  format = "auto",
}: {
  className?: string;
  format?: AdsenseFormat;
}) {
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
    <>
      <Script
        id="google-adsense-loader"
        src={ADSENSE_SCRIPT_URL}
        strategy="afterInteractive"
        crossOrigin="anonymous"
      />
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
          data-ad-format={format}
          data-full-width-responsive="true"
        />
      </div>
    </>
  );
}
