export const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const RECENT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ReporterIdentity = {
  accountId: string | null;
  anonymousTokenHash: string | null;
  ipHash: string;
};

export function duplicateIdentityMatches(
  a: ReporterIdentity,
  b: ReporterIdentity,
) {
  return Boolean(
    (a.accountId && b.accountId && a.accountId === b.accountId) ||
    (a.anonymousTokenHash &&
      b.anonymousTokenHash &&
      a.anonymousTokenHash === b.anonymousTokenHash) ||
    a.ipHash === b.ipHash,
  );
}

export function isWithinDuplicateWindow(previous: Date, now: Date) {
  const elapsed = now.getTime() - previous.getTime();
  return elapsed >= 0 && elapsed < DUPLICATE_WINDOW_MS;
}

export function isInRecentWindow(submittedAt: Date, now: Date) {
  return submittedAt.getTime() >= now.getTime() - RECENT_WINDOW_MS;
}
