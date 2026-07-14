import { parse } from "csv-parse/sync";
import { campgroundInput } from "./validation";

export type ImportRow = ReturnType<typeof campgroundInput.parse> & {
  rowNumber: number;
  duplicateOf?: string;
};

export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) *
      Math.cos(b.latitude * rad) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function parseCampgroundCsv(csv: string) {
  const raw = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Array<Record<string, string>>;
  const valid: ImportRow[] = [];
  const errors: Array<{ rowNumber: number; message: string }> = [];
  raw.forEach((row, index) => {
    const rowNumber = index + 2;
    const result = campgroundInput.safeParse({
      name: row.name,
      slug: row.slug,
      address: row.address,
      city: row.city,
      region: row.region || row.province || row.state,
      country: row.country,
      postalCode: row.postalCode || row.postal_code,
      latitude: row.latitude,
      longitude: row.longitude,
      website: row.website || "",
      description: row.description || "",
    });
    if (result.success) valid.push({ ...result.data, rowNumber });
    else
      errors.push({
        rowNumber,
        message: result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
  });
  return { valid, errors, total: raw.length };
}

export function flagLikelyDuplicates(
  rows: ImportRow[],
  existing: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
  }>,
) {
  return rows.map((row) => {
    const duplicate = existing.find(
      (item) =>
        item.name.toLowerCase() === row.name.toLowerCase() ||
        distanceKm(item, row) < 0.35,
    );
    return duplicate
      ? { ...row, duplicateOf: `${duplicate.name} (${duplicate.id})` }
      : row;
  });
}
