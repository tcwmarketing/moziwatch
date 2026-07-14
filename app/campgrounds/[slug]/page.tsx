import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampgroundBySlug, getCampgroundReports } from "@/lib/campgrounds";
import { publicEnv } from "@/lib/env";
import { CampgroundMiniMap } from "@/components/campground-mini-map";
import { RatingCard } from "@/components/rating-card";
import { ReportForm } from "@/components/report-form";
import { ratingLabel } from "@/config/ratings";
import { SaveCampgroundButton } from "@/components/save-campground-button";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { sqlClient } from "@/db";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const campground = await getCampgroundBySlug(slug);
    if (!campground) return {};
    const title = `${campground.name} mosquito reports`;
    return {
      title,
      description: `Recent and historical camper mosquito reports for ${campground.name} in ${campground.city}, ${campground.region}.`,
      alternates: { canonical: `/campgrounds/${slug}` },
    };
  } catch {
    return { title: "Campground reports" };
  }
}

export default async function CampgroundPage({ params }: Props) {
  const { slug } = await params;
  const campground = await getCampgroundBySlug(slug).catch(() => null);
  if (!campground) notFound();
  const session = await auth.api.getSession({ headers: await headers() });
  const [{ reports, distribution }, saved] = await Promise.all([
    getCampgroundReports(campground.id),
    session?.user
      ? sqlClient<{ saved: boolean }[]>`
          SELECT EXISTS(
            SELECT 1 FROM saved_campgrounds
            WHERE account_id = ${session.user.id} AND campground_id = ${campground.id}::uuid
          ) AS saved
        `
      : Promise.resolve([]),
  ]);
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="content-page campground-page">
      <header className="campground-hero">
        <div>
          <p className="eyebrow">Actual camper reports</p>
          <h1>{campground.name}</h1>
          <p>
            {campground.address}, {campground.city}, {campground.region}{" "}
            {campground.postal_code}, {campground.country}
          </p>
          <SaveCampgroundButton
            campgroundId={campground.id}
            initialSaved={Boolean(saved[0]?.saved)}
            signedIn={Boolean(session?.user)}
          />
        </div>
        <div className="campground-ratings">
          <RatingCard
            title="Past 30 Days"
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
          />
          <section className="content-card forecast-callout">
            <p className="eyebrow">Beta weather suitability forecast</p>
            <h2>Forecast and camper reports are separate</h2>
            <p>
              The map forecast is unvalidated beta model output based on
              Open-Meteo weather variables. It is not trained from user reports.
              The ratings on this page come only from published camper reports.
            </p>
          </section>
          <section className="content-card">
            <h2>Rating distribution</h2>
            {total === 0 ? (
              <p className="empty-state">
                No published reports yet. Be the first camper to share
                conditions.
              </p>
            ) : (
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
            )}
          </section>
          <section className="content-card">
            <h2>Recent camper reports</h2>
            {reports.length === 0 ? (
              <p className="empty-state">
                There are no published reports for this campground.
              </p>
            ) : (
              <div className="report-list">
                {reports.map((report) => (
                  <article key={report.id}>
                    <header>
                      <strong>{ratingLabel(report.rating)}</strong>
                      <time dateTime={report.submitted_at.toISOString()}>
                        {report.submitted_at.toLocaleDateString()}
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
            )}
          </section>
        </div>
        <aside className="content-card report-panel">
          <p className="eyebrow">Report what you observed</p>
          <h2>How are the mosquitoes?</h2>
          <p>
            Your report affects campground markers. It does not train or
            overwrite today&apos;s published forecast.
          </p>
          <ReportForm campgroundId={campground.id} />
        </aside>
      </div>
    </div>
  );
}
