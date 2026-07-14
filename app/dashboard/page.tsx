import Link from "next/link";
import { requireUser } from "@/lib/current-user";
import { sqlClient } from "@/db";
import { ratingLabel } from "@/config/ratings";
import { AccountActions } from "@/components/account-actions";
import { EditableReportComment } from "@/components/editable-report-comment";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser();
  const [reports, saved] = await Promise.all([
    sqlClient<
      {
        id: string;
        rating: number;
        comment: string | null;
        submitted_at: Date;
        name: string;
        slug: string;
        editable: boolean;
      }[]
    >`
      SELECT r.id, r.rating, r.comment, r.submitted_at, c.name, c.slug,
        r.submitted_at >= now() - (${Math.max(1, Math.min(72, Number(process.env.REPORT_COMMENT_EDIT_HOURS || 24)))}::text || ' hours')::interval AS editable
      FROM reports r JOIN campgrounds c ON c.id = r.campground_id
      WHERE r.account_id = ${session.user.id} AND r.deleted_at IS NULL ORDER BY r.submitted_at DESC
    `,
    sqlClient<{ name: string; slug: string; city: string; region: string }[]>`
      SELECT c.name, c.slug, c.city, c.region FROM saved_campgrounds s
      JOIN campgrounds c ON c.id = s.campground_id WHERE s.account_id = ${session.user.id} ORDER BY c.name
    `,
  ]);
  return (
    <div className="content-page dashboard-page">
      <header>
        <p className="eyebrow">Account dashboard</p>
        <h1>Your campground signal.</h1>
        <p>Signed in as {session.user.email}</p>
        {!session.user.emailVerified ? (
          <div className="notice">
            Verify your email to use account reporting features.
          </div>
        ) : null}
      </header>
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
                    <time>{report.submitted_at.toLocaleDateString()}</time>
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
          <h2>Account settings</h2>
          <p>
            Email status:{" "}
            <strong>
              {session.user.emailVerified ? "Verified" : "Verification needed"}
            </strong>
          </p>
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
