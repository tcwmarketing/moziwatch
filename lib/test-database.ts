export function assertDisposableTestDatabase() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
  if (process.env.TEST_DATABASE_DISPOSABLE !== "true")
    throw new Error(
      "Set TEST_DATABASE_DISPOSABLE=true only for a dedicated disposable test database",
    );
  for (const [name, candidate] of [
    ["DATABASE_URL", process.env.DATABASE_URL],
    ["DIRECT_DATABASE_URL", process.env.DIRECT_DATABASE_URL],
  ] as const) {
    if (
      candidate &&
      new URL(candidate).toString() === new URL(testUrl).toString()
    )
      throw new Error(`TEST_DATABASE_URL must never equal ${name}`);
  }
  return testUrl;
}
