import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { publicEnv } from "@/lib/env";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: `${publicEnv.appName} | Campground mosquito reports`,
    template: `%s | ${publicEnv.appName}`,
  },
  description:
    "Find and share current mosquito conditions at campgrounds across Canada and the United States.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: publicEnv.appName,
    description:
      "Camper reports and an experimental mosquito forecast, clearly separated.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Camp Signal — Know before the mosquitoes do.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: publicEnv.appName,
    description:
      "Camper reports and an experimental mosquito forecast, clearly separated.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader appName={publicEnv.appName} />
        <main id="main-content">{children}</main>
        <footer className="site-footer">
          <div>
            <strong>{publicEnv.appName}</strong>
            <p>Built for clearer nights outside.</p>
          </div>
          <nav aria-label="Footer navigation">
            <Link href="/about">How it works</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </nav>
          <p>
            Basemap by Protomaps and OpenStreetMap contributors. Forecast
            weather by Open-Meteo.
          </p>
        </footer>
      </body>
    </html>
  );
}
