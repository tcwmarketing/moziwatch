import {
  canonicalQuality,
  type CanonicalCampgroundRecord,
  type CanonicalDuplicateCandidate,
} from "./duplicate-audit";

export type AutomaticMergeCluster = {
  survivor: CanonicalCampgroundRecord;
  duplicates: CanonicalCampgroundRecord[];
  pairCount: number;
};

function preferredRecord(
  left: CanonicalCampgroundRecord,
  right: CanonicalCampgroundRecord,
) {
  const qualityDifference = canonicalQuality(right) - canonicalQuality(left);
  if (qualityDifference !== 0) return qualityDifference;
  return left.id.localeCompare(right.id);
}

export function planAutomaticMergeClusters(
  candidates: CanonicalDuplicateCandidate[],
): AutomaticMergeCluster[] {
  const automatic = candidates.filter(
    (candidate) => candidate.recommendation === "automatic",
  );
  const parent = new Map<string, string>();
  const records = new Map<string, CanonicalCampgroundRecord>();
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current) {
      parent.set(id, id);
      return id;
    }
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent.set(
      leftRoot < rightRoot ? rightRoot : leftRoot,
      leftRoot < rightRoot ? leftRoot : rightRoot,
    );
  };

  for (const candidate of automatic) {
    records.set(candidate.left.id, candidate.left);
    records.set(candidate.right.id, candidate.right);
    union(candidate.left.id, candidate.right.id);
  }

  const grouped = new Map<
    string,
    { records: CanonicalCampgroundRecord[]; pairCount: number }
  >();
  for (const record of records.values()) {
    const root = find(record.id);
    const cluster = grouped.get(root) ?? { records: [], pairCount: 0 };
    cluster.records.push(record);
    grouped.set(root, cluster);
  }
  for (const candidate of automatic) {
    const cluster = grouped.get(find(candidate.left.id));
    if (cluster) cluster.pairCount += 1;
  }

  return [...grouped.values()]
    .map((cluster) => {
      const ordered = cluster.records.sort(preferredRecord);
      return {
        survivor: ordered[0],
        duplicates: ordered.slice(1),
        pairCount: cluster.pairCount,
      };
    })
    .sort((left, right) => left.survivor.id.localeCompare(right.survivor.id));
}
