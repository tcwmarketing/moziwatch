export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  attempts = 5,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(45_000),
      });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status))
        throw new Error(`Source returned HTTP ${response.status}`);
      lastError = new Error(`Retryable source response ${response.status}`);
      const retryAfter = Number(response.headers.get("retry-after"));
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Number.isFinite(retryAfter)
            ? retryAfter * 1_000
            : Math.min(30_000, 500 * 2 ** attempt),
        ),
      );
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(30_000, 500 * 2 ** attempt)),
        );
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Source request failed");
}
