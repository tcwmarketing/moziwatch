export type ProvenanceEntry =
  | readonly [source: string, priority: number]
  | { source: string; priority: number };

export type Provenance = Record<string, ProvenanceEntry>;

function isTuple(
  entry: ProvenanceEntry,
): entry is readonly [source: string, priority: number] {
  return Array.isArray(entry);
}

function priority(entry: ProvenanceEntry | undefined) {
  if (!entry) return 0;
  return isTuple(entry) ? Number(entry[1]) || 0 : Number(entry.priority) || 0;
}

export function provenancePriority(provenance: Provenance, field: string) {
  return priority(provenance[field] || provenance._);
}

function tuple(entry: ProvenanceEntry) {
  return isTuple(entry)
    ? ([String(entry[0]), Number(entry[1])] as [string, number])
    : ([entry.source, Number(entry.priority)] as [string, number]);
}

export function compactProvenance(provenance: Provenance) {
  const entries = Object.entries(provenance).map(
    ([field, entry]) => [field, tuple(entry)] as const,
  );
  const explicitDefault = entries.find(([field]) => field === "_")?.[1];
  const counts = new Map<string, { value: [string, number]; count: number }>();
  for (const [field, value] of entries) {
    if (field === "_") continue;
    const key = JSON.stringify(value);
    const current = counts.get(key);
    counts.set(key, { value, count: (current?.count || 0) + 1 });
  }
  const defaultEntry =
    explicitDefault ||
    [...counts.values()].sort((left, right) => right.count - left.count)[0]
      ?.value;
  if (!defaultEntry) return {};
  const result: Record<string, [string, number]> = { _: defaultEntry };
  for (const [field, value] of entries) {
    if (field === "_" || JSON.stringify(value) === JSON.stringify(defaultEntry))
      continue;
    result[field] = value;
  }
  return result;
}
