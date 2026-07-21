export type RecentReportComment = {
  comment: string | null;
  observedAt: Date;
};

type Theme = {
  phrase: string;
  pattern: RegExp;
};

const THEMES: Theme[] = [
  { phrase: "Worse at dusk", pattern: /\b(dusk|evening|sunset|twilight)\b/i },
  { phrase: "Active at night", pattern: /\b(night|overnight|after dark)\b/i },
  {
    phrase: "Near water",
    pattern:
      /\b(water|lake|river|creek|pond|marsh|wetland|waterfront|shore)\b/i,
  },
  { phrase: "After rain", pattern: /\b(rain|rainy|storm|wet|damp|puddle)\b/i },
  {
    phrase: "Shaded areas",
    pattern: /\b(shade|shaded|forest|woods|wooded|trees)\b/i,
  },
  {
    phrase: "Around campsites",
    pattern: /\b(campsite|camp site|tent|picnic|firepit|fire pit)\b/i,
  },
  {
    phrase: "Repellent helpful",
    pattern: /\b(repellent|bug spray|deet|picaridin|icaridin)\b/i,
  },
  {
    phrase: "Head nets useful",
    pattern: /\b(head net|headnet|bug net|face net)\b/i,
  },
  {
    phrase: "Heavy swarms",
    pattern: /\b(swarm|swarming|relentless|everywhere|covered)\b/i,
  },
  { phrase: "Light activity", pattern: /\b(few|mild|light|hardly|not bad)\b/i },
  { phrase: "Less in wind", pattern: /\b(wind|windy|breeze|breezy)\b/i },
];

/**
 * Returns only genuinely repeated themes. Each report can count once per theme,
 * and a theme needs both two reports and at least 25% of the recent sample.
 */
export function summarizeRecentReportElements(
  reports: RecentReportComment[],
  now = new Date(),
) {
  const boundary = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recent = reports.filter(
    (report) =>
      report.comment?.trim() && report.observedAt.getTime() >= boundary,
  );
  if (recent.length < 2) return [];

  const minimumMatches = Math.max(2, Math.ceil(recent.length * 0.25));
  return THEMES.map((theme, order) => {
    const matched = recent.filter((report) =>
      theme.pattern.test(report.comment!),
    );
    return {
      phrase: theme.phrase,
      count: matched.length,
      newest: Math.max(
        0,
        ...matched.map((report) => report.observedAt.getTime()),
      ),
      order,
    };
  })
    .filter((theme) => theme.count >= minimumMatches)
    .sort(
      (left, right) =>
        right.count - left.count ||
        right.newest - left.newest ||
        left.order - right.order,
    )
    .slice(0, 3)
    .map((theme) => theme.phrase);
}
