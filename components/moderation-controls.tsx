"use client";

import { useState } from "react";

type Status = "published" | "hidden" | "rejected" | "deleted";

export function ModerationControls({
  reportId,
  initialStatus,
}: {
  reportId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="moderation-controls">
      <label>
        <span className="sr-only">Moderation status</span>
        <select
          value={status}
          disabled={busy}
          onChange={async (event) => {
            const next = event.target.value as Status;
            setBusy(true);
            const response = await fetch(`/api/admin/reports/${reportId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: next }),
            });
            if (response.ok) {
              setStatus(next);
              setMessage("Updated");
            } else {
              setMessage("Update failed");
            }
            setBusy(false);
          }}
        >
          <option value="published">Published</option>
          <option value="hidden">Hidden</option>
          <option value="rejected">Rejected</option>
          <option value="deleted">Deleted</option>
        </select>
      </label>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
