"use client";
import { useState } from "react";

type Preview = {
  valid: Array<
    Record<string, unknown> & { rowNumber: number; duplicateOf?: string }
  >;
  errors: Array<{ rowNumber: number; message: string }>;
  total: number;
};

export function AdminConsole() {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  async function readCsv(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "preview",
        filename: file.name,
        csv: await file.text(),
      }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || "Preview failed.");
    setPreview(result);
    setMessage("");
  }
  async function commit() {
    if (!preview) return;
    const rows = preview.valid.filter((row) => !row.duplicateOf);
    const response = await fetch("/api/admin/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "commit",
        filename: "reviewed-import.csv",
        rows,
      }),
    });
    const result = await response.json();
    setMessage(
      response.ok
        ? `Imported ${result.inserted} campgrounds.`
        : result.error || "Import failed.",
    );
  }
  return (
    <section className="content-card">
      <h2>Campground CSV import</h2>
      <p>
        Required columns: name, slug, address, city, region, country,
        postalCode, latitude, longitude.
      </p>
      <label className="file-input">
        Choose CSV
        <input type="file" accept=".csv,text/csv" onChange={readCsv} />
      </label>
      {preview ? (
        <div className="import-preview">
          <p>
            <strong>{preview.valid.length}</strong> valid,{" "}
            <strong>{preview.errors.length}</strong> errors,{" "}
            <strong>
              {preview.valid.filter((row) => row.duplicateOf).length}
            </strong>{" "}
            likely duplicates
          </p>
          {preview.errors.length ? (
            <ul>
              {preview.errors.map((error) => (
                <li key={error.rowNumber}>
                  Row {error.rowNumber}: {error.message}
                </li>
              ))}
            </ul>
          ) : null}
          {preview.valid.some((row) => row.duplicateOf) ? (
            <ul>
              {preview.valid
                .filter((row) => row.duplicateOf)
                .map((row) => (
                  <li key={row.rowNumber}>
                    Row {row.rowNumber}: likely duplicate of {row.duplicateOf}
                  </li>
                ))}
            </ul>
          ) : null}
          <button className="button primary" onClick={commit}>
            Commit reviewed rows
          </button>
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
