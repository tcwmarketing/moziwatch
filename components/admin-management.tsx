"use client";

import { useMemo, useState } from "react";
import { ModerationControls } from "./moderation-controls";

export type ManagedProfile = {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  role: "member" | "admin";
  disabled_at: string | Date | null;
  banned: boolean;
  ban_reason: string | null;
  created_at: string | Date;
  report_count: number;
  saved_count: number;
};

export type ManagedReportSubmission = {
  id: string;
  campground_name: string;
  rating: number;
  comment: string | null;
  moderation_status: string;
  spam_reasons: string[];
  submitted_at: string | Date;
  submitter_name: string | null;
  submitter_email: string | null;
};

export type ManagedContactSubmission = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "inbox" | "spam" | "archived";
  spam_reasons: string[];
  bot_provider: string;
  bot_score: number | null;
  bot_reasons: string[];
  bot_action: string | null;
  bot_annotation: string | null;
  bot_annotated_at: string | Date | null;
  created_at: string | Date;
};

export type ManagedLocationSuggestion = {
  id: string;
  kind: string;
  name: string | null;
  region: string | null;
  country: string | null;
  comment: string;
  submitter_email: string | null;
  status: string;
  created_at: string | Date;
};

type Tab = "profiles" | "reports" | "contacts" | "locations" | "spam-rules";

export function AdminManagement({
  profiles,
  reports,
  contacts,
  locationSuggestions,
  restrictedPhrases,
}: {
  profiles: ManagedProfile[];
  reports: ManagedReportSubmission[];
  contacts: ManagedContactSubmission[];
  locationSuggestions: ManagedLocationSuggestion[];
  restrictedPhrases: readonly string[];
}) {
  const [tab, setTab] = useState<Tab>("reports");
  const [profileRows, setProfileRows] = useState(profiles);
  const [contactRows, setContactRows] = useState(contacts);
  const [profileQuery, setProfileQuery] = useState("");
  const [message, setMessage] = useState("");
  const visibleProfiles = useMemo(() => {
    const query = profileQuery.trim().toLowerCase();
    if (!query) return profileRows;
    return profileRows.filter((profile) =>
      `${profile.name} ${profile.email}`.toLowerCase().includes(query),
    );
  }, [profileQuery, profileRows]);
  const cleanReports = reports.filter(
    (report) => report.moderation_status !== "spam",
  );
  const spamReports = reports.filter(
    (report) => report.moderation_status === "spam",
  );
  const cleanContacts = contactRows.filter(
    (contact) => contact.status !== "spam",
  );
  const spamContacts = contactRows.filter(
    (contact) => contact.status === "spam",
  );

  async function updateProfile(
    profile: ManagedProfile,
    action: "ban" | "reactivate" | "delete",
  ) {
    const reason =
      action === "ban"
        ? window.prompt("Optional reason for banning this account:") || ""
        : "";
    if (
      action === "delete" &&
      !window.confirm(
        `Permanently delete ${profile.name}'s account? Their reports will be anonymized.`,
      )
    )
      return;
    const response = await fetch(`/api/admin/users/${profile.id}`, {
      method: action === "delete" ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      ...(action === "delete"
        ? {}
        : { body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) }),
    });
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (!response.ok) {
      setMessage(result?.error || "The account could not be updated.");
      return;
    }
    if (action === "delete")
      setProfileRows((current) =>
        current.filter((item) => item.id !== profile.id),
      );
    else
      setProfileRows((current) =>
        current.map((item) =>
          item.id === profile.id
            ? {
                ...item,
                banned: action === "ban",
                disabled_at: action === "ban" ? new Date() : null,
                ban_reason: action === "ban" ? reason || null : null,
              }
            : item,
        ),
      );
    setMessage(
      action === "delete"
        ? "Account deleted."
        : action === "ban"
          ? "Account banned and active sessions revoked."
          : "Account reactivated.",
    );
  }

  async function updateContact(
    id: string,
    status: "inbox" | "spam" | "archived",
  ) {
    const response = await fetch(`/api/admin/contact-submissions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) return setMessage("The submission could not be updated.");
    setContactRows((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    setMessage("Submission updated.");
  }

  return (
    <section className="content-card admin-management">
      <div className="admin-management-heading">
        <div>
          <p className="eyebrow">Site administration</p>
          <h2>Profiles and submissions</h2>
        </div>
        <div
          className="admin-tabs"
          role="tablist"
          aria-label="Administration sections"
        >
          {(
            [
              ["profiles", `Profiles (${profileRows.length})`],
              ["reports", `Mosquito reports (${reports.length})`],
              ["contacts", `Contact messages (${contactRows.length})`],
              [
                "locations",
                `Campground requests (${locationSuggestions.length})`,
              ],
              ["spam-rules", "Spam filters"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {message ? (
        <p className="admin-message" role="status">
          {message}
        </p>
      ) : null}

      {tab === "profiles" ? (
        <div role="tabpanel" className="admin-panel">
          <label className="admin-profile-search">
            Search profiles
            <input
              value={profileQuery}
              onChange={(event) => setProfileQuery(event.target.value)}
              placeholder="Name or email"
              type="search"
            />
          </label>
          <div className="admin-profile-list">
            {visibleProfiles.map((profile) => {
              const inactive = profile.banned || Boolean(profile.disabled_at);
              return (
                <article key={profile.id} className="admin-profile-row">
                  <div>
                    <strong>{profile.name}</strong>
                    <span>{profile.email}</span>
                    <small>
                      {profile.email_verified ? "Verified" : "Unverified"} ·{" "}
                      {profile.role} · Joined{" "}
                      {new Date(profile.created_at).toLocaleDateString()}
                    </small>
                  </div>
                  <div className="admin-profile-counts">
                    <span>{profile.report_count} reports</span>
                    <span>{profile.saved_count} saved</span>
                    <strong
                      className={inactive ? "status-banned" : "status-active"}
                    >
                      {inactive ? "Banned" : "Active"}
                    </strong>
                  </div>
                  <div className="admin-profile-actions">
                    {inactive ? (
                      <button
                        className="button secondary compact-button"
                        onClick={() => updateProfile(profile, "reactivate")}
                      >
                        Reactivate
                      </button>
                    ) : (
                      <button
                        className="button secondary compact-button"
                        onClick={() => updateProfile(profile, "ban")}
                      >
                        Ban
                      </button>
                    )}
                    <button
                      className="button danger compact-button"
                      onClick={() => updateProfile(profile, "delete")}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "reports" ? (
        <div role="tabpanel" className="admin-panel submission-groups">
          <SubmissionReports
            title="Published and pending reports"
            reports={cleanReports}
          />
          <SubmissionReports title="Spam reports" reports={spamReports} />
        </div>
      ) : null}

      {tab === "contacts" ? (
        <div role="tabpanel" className="admin-panel submission-groups">
          <ContactSubmissions
            title="Inbox and archived messages"
            contacts={cleanContacts}
            onUpdate={updateContact}
          />
          <ContactSubmissions
            title="Spam contact messages"
            contacts={spamContacts}
            onUpdate={updateContact}
          />
        </div>
      ) : null}

      {tab === "locations" ? (
        <div role="tabpanel" className="admin-panel submission-groups">
          <section>
            <h3>Campground suggestions and corrections</h3>
            {locationSuggestions.length ? (
              locationSuggestions.map((item) => (
                <article className="admin-submission" key={item.id}>
                  <header>
                    <strong>
                      {item.kind === "correction"
                        ? "Correction"
                        : "Missing campground"}
                      : {item.name || "Unnamed location"}
                    </strong>
                    <span>{item.status}</span>
                  </header>
                  <p>{item.comment}</p>
                  <small>
                    {[item.region, item.country].filter(Boolean).join(", ")} ·{" "}
                    {new Date(item.created_at).toLocaleString()}
                  </small>
                </article>
              ))
            ) : (
              <p className="empty-state">No location submissions.</p>
            )}
          </section>
        </div>
      ) : null}

      {tab === "spam-rules" ? (
        <div role="tabpanel" className="admin-panel">
          <section className="spam-terms">
            <h3>Automatic spam filters</h3>
            <p>Any submitted URL is also routed to Spam.</p>
            <ul>
              {restrictedPhrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function SubmissionReports({
  title,
  reports,
}: {
  title: string;
  reports: ManagedReportSubmission[];
}) {
  return (
    <section>
      <h3>{title}</h3>
      {reports.length ? (
        reports.map((report) => (
          <article className="admin-submission" key={report.id}>
            <header>
              <strong>
                {report.campground_name} · Rating {report.rating}
              </strong>
              <ModerationControls
                reportId={report.id}
                initialStatus={report.moderation_status}
              />
            </header>
            <p>{report.comment || "No written comment."}</p>
            {report.spam_reasons.length ? (
              <small>Flagged: {report.spam_reasons.join(", ")}</small>
            ) : null}
            <small>
              {report.submitter_name || "Anonymous"} ·{" "}
              {new Date(report.submitted_at).toLocaleString()}
            </small>
          </article>
        ))
      ) : (
        <p className="empty-state">No reports in this tab.</p>
      )}
    </section>
  );
}

function ContactSubmissions({
  title,
  contacts,
  onUpdate,
}: {
  title: string;
  contacts: ManagedContactSubmission[];
  onUpdate: (id: string, status: "inbox" | "spam" | "archived") => void;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {contacts.length ? (
        contacts.map((contact) => (
          <article className="admin-submission" key={contact.id}>
            <header>
              <strong>{contact.subject}</strong>
              <select
                value={contact.status}
                onChange={(event) =>
                  onUpdate(
                    contact.id,
                    event.target.value as "inbox" | "spam" | "archived",
                  )
                }
              >
                <option value="inbox">Inbox</option>
                <option value="spam">Spam</option>
                <option value="archived">Archived</option>
              </select>
            </header>
            <p>{contact.message}</p>
            {contact.spam_reasons.length ? (
              <small>Flagged: {contact.spam_reasons.join(", ")}</small>
            ) : null}
            {contact.bot_score !== null ? (
              <small>
                reCAPTCHA score {contact.bot_score.toFixed(1)}
                {contact.bot_action ? ` Â· ${contact.bot_action}` : ""}
                {contact.bot_reasons.length
                  ? ` Â· ${contact.bot_reasons.join(", ")}`
                  : ""}
                {contact.bot_annotation
                  ? ` Â· confirmed ${contact.bot_annotation.toLowerCase()}`
                  : ""}
              </small>
            ) : (
              <small>
                Assessment score unavailable for this older message.
              </small>
            )}
            <small>
              {contact.name} · {contact.email} ·{" "}
              {new Date(contact.created_at).toLocaleString()}
            </small>
          </article>
        ))
      ) : (
        <p className="empty-state">No contact messages in this tab.</p>
      )}
    </section>
  );
}
