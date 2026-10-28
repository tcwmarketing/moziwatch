import type { Sql } from "postgres";

export class DatabaseReadOnlyError extends Error {
  constructor() {
    super(
      "Supabase is in read-only mode. Forecast publication is blocked until database/disk storage is recovered. Run forecast:cleanup -- --dry-run for retention candidates and inspect Supabase Infrastructure disk usage. Retrying the same forecast cannot recover storage.",
    );
    this.name = "DatabaseReadOnlyError";
  }
}

export function isDatabaseReadOnlyError(error: unknown) {
  return (
    error instanceof DatabaseReadOnlyError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "25006")
  );
}

export async function assertDatabaseWritable(client: Sql) {
  const [state] = await client<{ read_only: boolean }[]>`
    SELECT current_setting('transaction_read_only') = 'on' AS read_only
  `;
  if (state.read_only) throw new DatabaseReadOnlyError();
}
