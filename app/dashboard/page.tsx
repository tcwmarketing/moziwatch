import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { sqlClient } from "@/db";
import { ratingLabel } from "@/config/ratings";
import { AccountActions } from "@/components/account-actions";
import { EditableReportComment } from "@/components/editable-report-comment";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";
import { ProfileForm } from "@/components/profile-form";
import { PasswordSettings } from "@/components/password-settings";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser();
  const [reports, saved, profiles] = await Promise.all([
    sqlClient<
      {
        id: string;
        rating: number;
        comment: string | null;
        submitted_at: DatabaseDate;
        observed_on: DatabaseDate;
        name: string;
        slug: string;
        editable: boolean;
      }[]
    >`
      SELECT r.id, r.rating, r.comment, r.submitted_at, r.observed_on,
        c.name, c.slug,
        r.submitted_at >= now() - (${Math.max(1, Math.min(72, Number(process.env.REPORT_COMMENT_EDIT_HOURS || 24)))}::text || ' hours')::interval AS editable
      FROM reports r JOIN campgrounds c ON c.id = r.campground_id
      WHERE r.account_id = ${session.user.id} AND r.deleted_at IS NULL ORDER BY r.submitted_at DESC
    `,
    sqlClient<{ name: string; slug: string; city: string; region: string }[]>`
      SELECT c.name, c.slug, c.city, c.region FROM saved_campgrounds s
      JOIN campgrounds c ON c.id = s.campground_id WHERE s.account_id = ${session.user.id} ORDER BY c.name
    `,
    sqlClient<
      {
        name: string;
        home_city: string | null;
        home_city_region: string | null;
        home_city_country: "CA" | "US" | null;
        home_city_latitude: number | null;
        home_city_longitude: number | null;
        home_city_place_id: string | null;
        role: "member" | "admin";
      }[]
    >`
      SELECT name, home_city, home_city_region, home_city_country,
        home_city_latitude, home_city_longitude, home_city_place_id, role
      FROM "user" WHERE id = ${session.user.id} LIMIT 1
    `,
  ]);
  const profile = profiles[0];
  return (
    <div className="content-page dashboard-page">
      <header>
        <p className="eyebrow">Your MoziWatch profile</p>
        <h1>Saved campgrounds and reports.</h1>
        <p>Signed in as {session.user.email}</p>
        {!session.user.emailVerified ? (
          <div className="notice">
            Verify your email to use account reporting features.
          </div>
        ) : null}
      </header>
      {profile?.role === "admin" ? (
        <section
          className="content-card profile-admin-access"
          aria-label="Administrator access"
        >
          <div>
            <p className="eyebrow">Administrator account</p>
            <h2>Site administration</h2>
            <p>
              Review accounts, camper submissions, spam and campground data.
            </p>
          </div>
          <nav className="admin-section-nav" aria-label="Administrator tools">
            <Link href="/admin">Profiles and submissions</Link>
            <Link href="/admin/locations">Campground data</Link>
          </nav>
        </section>
      ) : null}
      <div className="dashboard-grid">
        <section className="content-card">
          <h2>Saved campgrounds</h2>
          {saved.length ? (
            <ul className="clean-list">
              {saved.map((item) => (
                <li key={item.slug}>
                  <Link href={`/campgrounds/${item.slug}`}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.city}, {item.region}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              No saved campgrounds yet. Open a campground page to save it.
            </p>
          )}
        </section>
        <section className="content-card">
          <h2>Your reports</h2>
          {reports.length ? (
            <div className="report-list">
              {reports.map((report) => (
                <article key={report.id}>
                  <header>
                    <Link href={`/campgrounds/${report.slug}`}>
                      <strong>{report.name}</strong>
                    </Link>
                    <time>
                      {parseDatabaseDate(
                        report.observed_on,
                      ).toLocaleDateString()}
                    </time>
                  </header>
                  <p>{ratingLabel(report.rating)}</p>
                  <EditableReportComment
                    reportId={report.id}
                    initialComment={report.comment}
                    editable={report.editable}
                  />
                  <small>
                    Ratings are permanent. Comments can be edited for 24 hours.
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              You have not submitted an account report yet.
            </p>
          )}
        </section>
        <section className="content-card">
          <h2>Profile details</h2>
          <ProfileForm
            initialName={profile?.name || session.user.name}
            initialEmail={session.user.email}
            initialHomeCity={profile?.home_city || ""}
            initialHomeCitySelection={
              profile?.home_city &&
              profile.home_city_country &&
              profile.home_city_latitude !== null &&
              profile.home_city_longitude !== null
                ? {
                    id: profile.home_city_place_id || "saved",
                    city: profile.home_city.split(",")[0] || profile.home_city,
                    region: profile.home_city_region || "",
                    country: profile.home_city_country,
                    label: profile.home_city,
                    latitude: profile.home_city_latitude,
                    longitude: profile.home_city_longitude,
                  }
                : null
            }
          />
        </section>
        <section className="content-card">
          <h2>Password and account</h2>
          <p>
            Email status:{" "}
            <strong>
              {session.user.emailVerified ? "Verified" : "Verification needed"}
            </strong>
          </p>
          <PasswordSettings email={session.user.email} />
          <p>
            Deleting your account permanently removes its link to your reports.
            The anonymized reports may remain in campground totals.
          </p>
          <AccountActions
            email={session.user.email}
            emailVerified={session.user.emailVerified}
          />
        </section>
      </div>
    </div>
  );
}
