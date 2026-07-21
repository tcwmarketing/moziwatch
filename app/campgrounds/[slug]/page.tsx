import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import {
  campgroundLocationTypeLabel,
  getCampgroundBySlug,
  getCampgroundReports,
} from "@/lib/campgrounds";
import { publicEnv } from "@/lib/env";
import { CampgroundMiniMap } from "@/components/campground-mini-map";
import { RatingCard } from "@/components/rating-card";
import { ReportForm } from "@/components/report-form";
import { markerStateForAverage, ratingLabel } from "@/config/ratings";
import { CampgroundActions } from "@/components/campground-actions";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sqlClient } from "@/db";
import { getCampgroundOutlook } from "@/lib/campground-forecast";
import { ForecastInterestBeacon } from "@/components/forecast-interest-beacon";
import { CampgroundWeatherForecast } from "@/components/campground-weather-forecast";
import { CampgroundProducts } from "@/components/campground-products";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ save?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const campground = await getCampgroundBySlug(slug);
    if (!campground) return {};
    const title = `${campground.name} mosquito reports and outlook`;
    const description = `Check recent camper mosquito reports, local weather and the approximate mosquito outlook for ${campground.name} in ${campground.city}, ${campground.region}.`;
    const canonical = absoluteUrl(`/campgrounds/${campground.slug}`);
    return {
      title,
      description,
      alternates: { canonical },
      openGraph: { title, description, url: canonical, type: "website" },
    };
  } catch {
    return { title: "Campground reports" };
  }
}

export default async function CampgroundPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const resolvedSearch = await searchParams;
  const campground = await getCampgroundBySlug(slug).catch(() => null);
  if (!campground) {
    const aliases = await sqlClient<{ current_slug: string }[]>`
      SELECT c.slug AS current_slug FROM location_aliases a
      JOIN campgrounds c ON c.id = a.campground_id WHERE a.slug = ${slug} LIMIT 1
    `.catch(() => []);
    if (aliases[0]) redirect(`/campgrounds/${aliases[0].current_slug}`);
    notFound();
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const [{ reports, distribution }, saved, outlook] = await Promise.all([
    getCampgroundReports(campground.id),
    session?.user
      ? sqlClient<{ saved: boolean }[]>`
          SELECT EXISTS(
            SELECT 1 FROM saved_campgrounds
            WHERE account_id = ${session.user.id} AND campground_id = ${campground.id}::uuid
          ) AS saved
        `
      : Promise.resolve([]),
    getCampgroundOutlook(campground.id),
  ]);
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  const facilities = [
    ...new Set(
      (campground.facility_values || []).filter(
        (facility): facility is string =>
          Boolean(facility) && facility !== "NULL",
      ),
    ),
  ].slice(0, 5);
  const address = campground.address?.trim();
  const hasAddress =
    Boolean(address) &&
    !["address not provided", "unknown", "n/a", "null"].includes(
      address!.toLowerCase(),
    );
  const locationLine = (
    hasAddress
      ? [
          address,
          campground.city,
          campground.region,
          campground.postal_code,
          campground.country,
        ]
      : [campground.city, campground.region, campground.country]
  )
    .filter(
      (part) =>
        Boolean(part) &&
        !["unknown", "address not provided", "null"].includes(
          String(part).trim().toLowerCase(),
        ),
    )
    .join(", ");
  const campgroundJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Campground",
        name: campground.name,
        url: absoluteUrl(`/campgrounds/${campground.slug}`),
        geo: {
          "@type": "GeoCoordinates",
          latitude: campground.latitude,
          longitude: campground.longitude,
        },
        address: {
          "@type": "PostalAddress",
          ...(hasAddress ? { streetAddress: address } : {}),
          addressLocality: campground.city,
          addressRegion: campground.region,
          postalCode: campground.postal_code || undefined,
          addressCountry: campground.country,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Campgrounds",
            item: absoluteUrl("/campgrounds"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: campground.name,
            item: absoluteUrl(`/campgrounds/${campground.slug}`),
          },
        ],
      },
    ],
  };
  return (
    <div className="content-page campground-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(campgroundJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <ForecastInterestBeacon campgroundId={campground.id} />
      <header className="campground-hero">
        <div>
          <p className="eyebrow">Mosquito Reports and Forecasts for</p>
          <h1>{campground.name}</h1>
          <p>{locationLine}</p>
          <p className="location-kind">
            <strong>
              {campgroundLocationTypeLabel(campground.location_type)}
            </strong>
            {campground.official_campsite_count !== null
              ? ` · ${campground.official_campsite_count} campsite${campground.official_campsite_count === 1 ? "" : "s"}`
              : ""}
          </p>
          {campground.maintenance_status || facilities.length ? (
            <p className="location-source-details">
              {[campground.maintenance_status, facilities.join(", ")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          ) : null}
          <CampgroundActions
            campgroundId={campground.id}
            campgroundName={campground.name}
            campgroundSlug={campground.slug}
            country={campground.country}
            region={campground.region}
            locality={campground.city}
            initialSaved={Boolean(saved[0]?.saved)}
            signedIn={Boolean(session?.user)}
            saveOnLoad={resolvedSearch?.save === "1"}
          />
        </div>
        <div className="campground-ratings">
          <RatingCard
            title="Recent"
            average={campground.recent_average}
            count={campground.recent_count}
          />
          <RatingCard
            title="Historical"
            average={campground.historical_average}
            count={campground.historical_count}
          />
        </div>
      </header>
      <div className="campground-layout">
        <div>
          <CampgroundMiniMap
            latitude={campground.latitude}
            longitude={campground.longitude}
            styleUrl={publicEnv.protomapsStyleUrl}
            apiKey={publicEnv.protomapsApiKey}
            markerColor={markerStateForAverage(campground.recent_average).color}
          />
          {campground.report_summary_phrases.length ? (
            <div
              className="report-summary-strip"
              aria-label="Common themes in recent reports"
            >
              <strong>Campers commonly mention</strong>
              <div>
                {campground.report_summary_phrases.map((phrase) => (
                  <span key={phrase}>{phrase}</span>
                ))}
              </div>
            </div>
          ) : null}
          <CampgroundWeatherForecast campgroundId={campground.id} />
          <section className="content-card forecast-callout">
            <p className="eyebrow">Mosquito outlook</p>
            <h2>Tonight and the next seven nights</h2>
            {outlook ? (
              <>
                <div className="forecast-outlook-grid">
                  {outlook.nights.map((night) => (
                    <article key={night.targetDate}>
                      <span>
                        {night.dayOffset === 0
                          ? "Tonight"
                          : new Date(night.targetDate).toLocaleDateString(
                              undefined,
                              { weekday: "short" },
                            )}
                      </span>
                      <strong>{night.level}</strong>
                      <b>{Math.round(night.score * 100)}/100</b>
                      <small>
                        {Math.round(night.confidence * 100)}% confidence
                      </small>
                    </article>
                  ))}
                </div>
                <details className="forecast-explanation">
                  <summary>What is affecting tonight&apos;s outlook?</summary>
                  <div>
                    <p>
                      This approximate outlook combines the campground&apos;s
                      surrounding habitat with recent weather, rainfall,
                      temperature, wind and expected evening conditions.
                      Eligible recent and seasonal camper reports can adjust the
                      result when enough consistent evidence is available.
                    </p>
                    <ul className="forecast-factor-list">
                      {outlook.nights[0].factors.map((factor) => (
                        <li key={factor}>{factor}</li>
                      ))}
                    </ul>
                    <p>
                      Camper-report ratings remain separate from this modeled
                      outlook, so you can compare what people observed with what
                      conditions are expected next.
                    </p>
                  </div>
                </details>
                <small className="forecast-updated">
                  Updated {new Date(outlook.generatedAt).toLocaleString()}.
                </small>
              </>
            ) : (
              <p>
                A campground forecast has not been published here yet. Actual
                camper-report ratings remain available above and are never
                replaced by a modeled value.
              </p>
            )}
          </section>
          <CampgroundProducts
            forecastLevel={
              outlook?.nights[0]?.level || campground.forecast_level
            }
            recentAverage={campground.recent_average}
          />
          {total > 0 ? (
            <section className="content-card">
              <h2>Rating distribution</h2>
              <div className="distribution">
                {[1, 2, 3, 4, 5].map((rating) => {
                  const count =
                    distribution.find((item) => item.rating === rating)
                      ?.count || 0;
                  return (
                    <div key={rating}>
                      <span>{ratingLabel(rating)}</span>
                      <i>
                        <b style={{ width: `${(count / total) * 100}%` }} />
                      </i>
                      <strong>{count}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {reports.length > 0 ? (
            <section className="content-card">
              <h2>Recent camper reports</h2>
              <div className="report-list">
                {reports.map((report) => (
                  <article
                    className={`report-rating-${report.rating}`}
                    key={report.id}
                  >
                    <header>
                      <strong>{ratingLabel(report.rating)}</strong>
                      <time dateTime={report.observed_on.toISOString()}>
                        Observed {report.observed_on.toLocaleDateString()}
                      </time>
                    </header>
                    <p>{report.comment || "No comment was added."}</p>
                    <small>
                      {report.account_report
                        ? "Account report"
                        : "Anonymous report"}
                    </small>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="content-card report-panel">
          <p className="eyebrow">Report what you observed</p>
          <h2>How are the mosquitoes?</h2>
          <p>
            Your report updates the campground&apos;s observed rating and may
            help adjust future outlooks without replacing actual camper reports.
          </p>
          <ReportForm campgroundId={campground.id} />
        </aside>
      </div>
    </div>
  );
}
