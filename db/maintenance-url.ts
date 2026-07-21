export function maintenanceDatabaseUrl(
  environment: Partial<NodeJS.ProcessEnv> = process.env,
) {
  if (environment.DIRECT_DATABASE_URL) return environment.DIRECT_DATABASE_URL;
  const pooled = environment.DATABASE_URL;
  if (!pooled)
    throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required");

  const url = new URL(pooled);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    // Supabase's port 5432 session pooler is suitable for migrations and
    // maintenance when the direct IPv6 endpoint is unavailable locally.
    url.port = "5432";
    return url.toString();
  }
  return pooled;
}
