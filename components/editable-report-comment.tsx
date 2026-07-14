"use client";

import { useState } from "react";

export function EditableReportComment({
  reportId,
  initialComment,
  editable,
}: {
  reportId: string;
  initialComment: string | null;
  editable: boolean;
}) {
  const [comment, setComment] = useState(initialComment || "");
  const [draft, setDraft] = useState(comment);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");

  if (!editing)
    return (
      <div className="editable-comment">
        <p>{comment || "No comment was added."}</p>
        {editable ? (
          <button
            className="text-button"
            type="button"
            onClick={() => setEditing(true)}
          >
            Edit comment
          </button>
        ) : null}
        {message ? <small role="status">{message}</small> : null}
      </div>
    );

  return (
    <form
      className="editable-comment"
      onSubmit={async (event) => {
        event.preventDefault();
        const response = await fetch(`/api/reports/${reportId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: draft }),
        });
        const result = await response.json().catch(() => ({}));
        if (response.ok) {
          setComment(draft.trim());
          setEditing(false);
          setMessage("Comment updated.");
        } else {
          setMessage(result.error || "The comment could not be updated.");
        }
      }}
    >
      <label>
        Edit comment
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={800}
        />
      </label>
      <div className="inline-actions">
        <button className="button primary compact-button">Save comment</button>
        <button
          className="button secondary compact-button"
          type="button"
          onClick={() => setEditing(false)}
        >
          Cancel
        </button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </form>
  );
}
