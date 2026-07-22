import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import "@fontsource-variable/montserrat";
import "./globals.css";
import { publicEnv } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";
import { absoluteUrl } from "@/lib/seo";

const GOOGLE_TAG_MANAGER_ID = "GTM-NJSLKFPG";
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: `${publicEnv.appName} | Campground mosquito reports`,
    template: `%s | ${publicEnv.appName}`,
  },
  description:
    "Find and share current mosquito conditions at campgrounds across Canada and the United States.",
  applicationName: publicEnv.appName,
  authors: [{ name: "MoziWatch", url: absoluteUrl() }],
  creator: "MoziWatch",
  publisher: "MoziWatch",
  other: {
    "google-adsense-account": "ca-pub-8746662508326131",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [{ url: "/moziwatch-logo-tbg.png", type: "image/png" }],
    shortcut: "/moziwatch-logo-tbg.png",
    apple: [{ url: "/moziwatch-logo-tbg.png", type: "image/png" }],
  },
  openGraph: {
    title: publicEnv.appName,
    description:
      "Recent camper reports and approximate mosquito outlooks, clearly separated.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1728,
        height: 900,
        alt: "MoziWatch — campground mosquito reports and forecasts.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: publicEnv.appName,
    description:
      "Recent camper reports and approximate mosquito outlooks, clearly separated.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8746662508326131"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Script id="google-tag-manager" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GOOGLE_TAG_MANAGER_ID}');`}
        </Script>
        {RECAPTCHA_SITE_KEY ? (
          <Script
            id="recaptcha-enterprise"
            src={`https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`}
            strategy="afterInteractive"
          />
        ) : null}
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GOOGLE_TAG_MANAGER_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="support-bar">
          <span>Love this idea? Support the venture with a donation.</span>
          <Link href="/support">Donate</Link>
        </div>
        <SiteHeader appName={publicEnv.appName} />
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          <div>
            <strong>{publicEnv.appName}</strong>
            <p>
              Campground mosquito reports that help you pack for the conditions.
            </p>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/campgrounds">Campgrounds</Link>
            <Link href="/products">Suggested products</Link>
            <Link href="/support">Support us</Link>
            <Link href="/contact">Contact us</Link>
            <Link href="/data-sources">Data sources</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <p>
            Basemap by Protomaps and OpenStreetMap contributors. Forecast
            weather by Open-Meteo.
          </p>
          <p className="footer-affiliate-disclosure">
            FTC disclosure: MoziWatch may earn a commission from product links.
            As an Amazon Associate, MoziWatch earns from qualifying purchases.
          </p>
        </footer>
      </body>
    </html>
  );
}
