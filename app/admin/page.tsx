import { requireAdmin } from "@/lib/current-user";
import { sqlClient } from "@/db";
import { AdminConsole } from "@/components/admin-console";
import { ModerationControls } from "@/components/moderation-controls";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [counts, recentReports, runs] = await Promise.all([
    sqlClient<
      { campgrounds: number; reports: number; users: number }[]
    >`SELECT (SELECT count(*)::int FROM campgrounds) campgrounds, (SELECT count(*)::int FROM reports) reports, (SELECT count(*)::int FROM "user") users`,
    sqlClient<
      {
        id: string;
        name: string;
        rating: number;
        moderation_status: string;
        submitted_at: Date;
      }[]
    >`SELECT r.id, c.name, r.rating, r.moderation_status, r.submitted_at FROM reports r JOIN campgrounds c ON c.id = r.campground_id ORDER BY r.submitted_at DESC LIMIT 20`,
    sqlClient<
      {
        id: string;
        version: string;
        status: string;
        forecast_date: Date;
        generated_at: Date | null;
        error: string | null;
      }[]
    >`SELECT r.id, m.version, r.status, r.forecast_date, r.generated_at, r.error FROM forecast_runs r JOIN forecast_models m ON m.id = r.model_id ORDER BY r.created_at DESC LIMIT 10`,
  ]);
  const stats = counts[0] || { campgrounds: 0, reports: 0, users: 0 };
  return (
    <div className="content-page admin-page">
      <header>
        <p className="eyebrow">Secured administration</p>
        <h1>Operations and moderation.</h1>
      </header>
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
          <strong>{runs[0]?.status || "Not run"}</strong>
          <span>Forecast job</span>
        </div>
      </div>
      <div className="dashboard-grid">
        <AdminConsole />
        <section className="content-card">
          <h2>Recent reports</h2>
          <div className="admin-table" role="table">
            {recentReports.map((report) => (
              <div role="row" key={report.id}>
                <span>{report.name}</span>
                <span>Rating {report.rating}</span>
                <ModerationControls
                  reportId={report.id}
                  initialStatus={report.moderation_status}
                />
                <time>{report.submitted_at.toLocaleDateString()}</time>
              </div>
            ))}
          </div>
        </section>
        <section className="content-card">
          <h2>Forecast status</h2>
          {runs.length ? (
            <div className="admin-table">
              {runs.map((run) => (
                <div key={run.id}>
                  <span>{run.version}</span>
                  <span>{run.status}</span>
                  <time>{run.forecast_date.toLocaleDateString()}</time>
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
      </div>
    </div>
  );
}
