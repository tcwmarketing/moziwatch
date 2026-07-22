import type { Metadata } from "next";
import { AdsenseUnit } from "@/components/adsense-unit";
import { MapExperience } from "@/components/map-experience";
import { publicEnv } from "@/lib/env";
import { absoluteUrl } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check mosquito conditions at campgrounds",
  description:
    "Check recent camper ratings, historical mosquito conditions and weather-based forecasts for campgrounds across Canada and the United States.",
  alternates: { canonical: absoluteUrl() },
  openGraph: {
    title: "Check mosquito conditions at campgrounds | MoziWatch",
    description:
      "Check recent camper ratings, historical mosquito conditions and weather-based forecasts for campgrounds across Canada and the United States.",
    url: absoluteUrl(),
  },
};

export default function Home() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: publicEnv.appName,
    url: absoluteUrl(),
    description:
      "Recent mosquito reports and approximate outlooks for campgrounds across Canada and the United States.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/campgrounds")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <section className="home-intro">
        <div>
          <p className="eyebrow">Campground conditions, shared by campers</p>
          <h1>Check Mosquito Conditions at Campgrounds</h1>
        </div>
        <div className="home-intro-copy">
          <p>
            Check recent camper ratings, historical mosquito conditions and
            weather-based forecasts for campgrounds across Canada and the United
            States.
          </p>
          <Link className="button secondary" href="/campgrounds">
            Browse campground listings
          </Link>
        </div>
      </section>
      <AdsenseUnit className="adsense-home-top" />
      <MapExperience
        mapConfig={{
          mode: publicEnv.basemapMode,
          styleUrl: publicEnv.protomapsStyleUrl,
          apiKey: publicEnv.protomapsApiKey,
          pmtilesUrl: publicEnv.protomapsPmtilesUrl,
        }}
      />
      <section className="home-steps" aria-label="How to use MoziWatch">
        <article>
          <h2>Find your campground</h2>
          <p>
            Search the map or browse the campground directory to find places
            across Canada and the United States.
          </p>
        </article>
        <article>
          <h2>Check recent conditions</h2>
          <p>
            See what campers recently reported and, where available, review an
            approximate outlook for the coming nights.
          </p>
        </article>
        <article>
          <h2>Help the next camper</h2>
          <p>
            Submit a quick mosquito report after your visit so other families
            can arrive prepared.
          </p>
        </article>
      </section>
      <section className="home-seo-sections">
        <article className="home-seo-feature">
          <div>
            <p className="eyebrow">Campground mosquito reports</p>
            <h2>How bad are the mosquitoes at the campground?</h2>
          </div>
          <div>
            <p>
              That is the practical question campers ask before a trip.
              MoziWatch shows recent mosquito reports from people who were
              actually there and, where available, a campground-specific outlook
              based on recent weather and surrounding habitat.
            </p>
            <p>
              Search a campground to see whether conditions were reported as
              none, light, moderate, heavy or severe. Reports and forecasts stay
              separate so it is always clear what campers observed and what is
              estimated.
            </p>
            <Link href="/campgrounds">Check a campground</Link>
          </div>
        </article>

        <article className="home-seo-feature home-packing-guide">
          <div>
            <p className="eyebrow">Pack for the conditions</p>
            <h2>What mosquito gear should you bring camping?</h2>
          </div>
          <div>
            <p>
              Light activity may only call for a small bottle of DEET or
              picaridin. Moderate conditions are easier with repellent,
              protective clothing or a head net. For heavy or severe mosquito
              activity, pack full coverage, a head net and a screened shelter so
              your campsite remains usable.
            </p>
            <p>
              Checking conditions before you leave helps you bring enough
              protection without packing equipment you are unlikely to use.
            </p>
            <Link href="/products">See mosquito protection by severity</Link>
          </div>
        </article>

        <article className="home-story">
          <p className="eyebrow">Why I built MoziWatch</p>
          <h2>“How are the mosquitoes?”</h2>
          <p>
            As an avid camper, our family always asks that question. We want to
            know whether we need to put on bug spray as soon as we arrive at the
            campground. In many of the camping groups I&apos;m in, the mosquito
            situation is a frequent topic. In some cases, the topic was even
            banned because there were so many posts about it.
          </p>
          <p>
            MoziWatch is a place where campers can find out how bad the
            mosquitoes are at a campground—and help the next camper by sharing
            what they experienced.
          </p>
          <p className="home-signoff">
            Happy Camping,
            <br />
            <strong>Clinton</strong>
          </p>
        </article>

        <article className="home-future">
          <p className="eyebrow">What&apos;s in the future?</p>
          <h2>More useful reports for more pesky insects</h2>
          <p>
            As the website gets used more, I&apos;d like to add reports for
            black flies, no-see-ums, ticks and other insects that can affect a
            camping trip.
          </p>
        </article>
      </section>
    </>
  );
}
