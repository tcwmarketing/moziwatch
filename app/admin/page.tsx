import { requireAdmin } from "@/lib/current-user";
import { sqlClient } from "@/db";
import { AdminConsole } from "@/components/admin-console";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";
import type { Metadata } from "next";
import Link from "next/link";
import {
  AdminManagement,
  type ManagedContactSubmission,
  type ManagedLocationSuggestion,
  type ManagedProfile,
  type ManagedReportSubmission,
} from "@/components/admin-management";
import { RESTRICTED_SPAM_PHRASES } from "@/lib/spam-review";
import { AdminPageTabs } from "@/components/admin-page-tabs";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

async function timedAdminQuery<T>(
  label: string,
  query: PromiseLike<readonly T[]>,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const rows = await Promise.race([
      Promise.resolve(query),
      new Promise<readonly T[]>((resolve) => {
        timeout = setTimeout(() => {
          console.error(`Admin query timed out: ${label}`);
          resolve([]);
        }, 12_000);
      }),
    ]);
    return [...rows];
  } catch (error) {
    console.error(`Admin query failed: ${label}`, error);
    return [];
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default async function AdminPage() {
  await requireAdmin();
  const [
    counts,
    recentReports,
    runs,
    profiles,
    contactSubmissions,
    locationSuggestions,
  ] = await Promise.all([
    timedAdminQuery(
      "counts",
      sqlClient<
        {
          campgrounds: number;
          reports: number;
          users: number;
          habitat_profiles: number;
          current_outlooks: number;
          daily_schedules: number;
          weekly_schedules: number;
        }[]
      >`
      SELECT
        (SELECT count(*)::int FROM campgrounds WHERE active = true) campgrounds,
        (SELECT count(*)::int FROM reports WHERE deleted_at IS NULL) reports,
        (SELECT count(*)::int FROM "user") users,
        (SELECT count(DISTINCT campground_id)::int
          FROM campground_habitat_profiles WHERE active = true) habitat_profiles,
        (SELECT count(DISTINCT cf.campground_id)::int
          FROM campground_forecasts cf
          JOIN forecast_runs fr ON fr.id = cf.run_id
          WHERE fr.is_production = true
            AND fr.status IN ('running', 'published', 'failed')
            AND cf.target_date::date >= CURRENT_DATE) current_outlooks,
        (SELECT count(*)::int FROM campground_forecast_schedules
          WHERE cadence = 'daily') daily_schedules,
        (SELECT count(*)::int FROM campground_forecast_schedules
          WHERE cadence = 'weekly') weekly_schedules
    `,
    ),
    timedAdminQuery(
      "reports",
      sqlClient<ManagedReportSubmission[]>`
      SELECT r.id, c.name AS campground_name, r.rating, r.comment,
        r.moderation_status, r.spam_reasons, r.submitted_at,
        u.name AS submitter_name, u.email AS submitter_email
      FROM reports r
      JOIN campgrounds c ON c.id = r.campground_id
      LEFT JOIN "user" u ON u.id = r.account_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.submitted_at DESC LIMIT 200
    `,
    ),
    timedAdminQuery(
      "forecast-runs",
      sqlClient<
        {
          id: string;
          version: string;
          status: string;
          forecast_date: DatabaseDate;
          generated_at: DatabaseDate | null;
          error: string | null;
        }[]
      >`SELECT r.id, m.version, r.status, r.forecast_date, r.generated_at, r.error FROM forecast_runs r JOIN forecast_models m ON m.id = r.model_id ORDER BY r.created_at DESC LIMIT 10`,
    ),
    timedAdminQuery(
      "profiles",
      sqlClient<ManagedProfile[]>`
      SELECT u.id, u.name, u.email, u.email_verified, u.role, u.disabled_at,
        u.banned, u.ban_reason, u.created_at,
        count(DISTINCT r.id)::int AS report_count,
        count(DISTINCT s.campground_id)::int AS saved_count
      FROM "user" u
      LEFT JOIN reports r ON r.account_id = u.id AND r.deleted_at IS NULL
      LEFT JOIN saved_campgrounds s ON s.account_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 500
    `,
    ),
    timedAdminQuery(
      "contacts",
      sqlClient<ManagedContactSubmission[]>`
      SELECT id, name, email, subject, message, status, spam_reasons, created_at
      FROM contact_submissions
      ORDER BY created_at DESC
      LIMIT 200
    `,
    ),
    timedAdminQuery(
      "location-suggestions",
      sqlClient<ManagedLocationSuggestion[]>`
      SELECT id, kind, name, region, country, comment, submitter_email, status,
        created_at
      FROM location_suggestions
      ORDER BY created_at DESC
      LIMIT 100
    `,
    ),
  ]);
  const stats = counts[0] || {
    campgrounds: 0,
    reports: 0,
    users: 0,
    habitat_profiles: 0,
    current_outlooks: 0,
    daily_schedules: 0,
    weekly_schedules: 0,
  };
  return (
    <div className="content-page admin-page">
      <header>
        <p className="eyebrow">Secured administration</p>
        <h1>Operations and moderation.</h1>
      </header>
      <nav className="admin-section-nav" aria-label="Administration areas">
        <Link className="active" href="/admin">
          Profiles and submissions
        </Link>
        <Link href="/admin/locations">Campground data</Link>
      </nav>
      <div className="admin-stats">
        <div>
          <strong>{stats.campgrounds}</strong>
          <span>Campgrounds</span>
        </div>
        <div>
          <strong>{stats.reports}</strong>
          <span>Reports</span>
        </div>
        <div>
          <strong>{stats.users}</strong>
          <span>Accounts</span>
        </div>
        <div>
          <strong>{stats.habitat_profiles.toLocaleString()}</strong>
          <span>Habitat profiles</span>
        </div>
        <div>
          <strong>{stats.current_outlooks.toLocaleString()}</strong>
          <span>Current outlooks</span>
        </div>
        <div>
          <strong>{runs[0]?.status || "Not run"}</strong>
          <span>Forecast job</span>
        </div>
      </div>
      <AdminPageTabs
        management={
          <AdminManagement
            profiles={profiles}
            reports={recentReports}
            contacts={contactSubmissions}
            locationSuggestions={locationSuggestions}
            restrictedPhrases={RESTRICTED_SPAM_PHRASES}
          />
        }
        imports={<AdminConsole />}
        forecast={
          <section className="content-card">
            <h2>Forecast status</h2>
            <p>
              {stats.daily_schedules.toLocaleString()} campgrounds are scheduled
              daily and {stats.weekly_schedules.toLocaleString()} weekly. The
              coverage export lists the 5,000 highest-priority profiled
              campgrounds and shows whether each current outlook has been
              published or is still pending.
            </p>
            <p>
              <a
                className="button secondary"
                href="/api/admin/forecast-coverage"
              >
                Download forecast coverage
              </a>
            </p>
            {runs.length ? (
              <div className="admin-table">
                {runs.map((run) => (
                  <div key={run.id}>
                    <span>{run.version}</span>
                    <span>{run.status}</span>
                    <time>
                      {parseDatabaseDate(
                        run.forecast_date,
                      ).toLocaleDateString()}
                    </time>
                    <span>{run.error || "No errors"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">
                No forecast job has run. Production remains unavailable until a
                beta model is published.
              </p>
            )}
          </section>
        }
      />
    </div>
  );
}
