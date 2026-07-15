export type DatabaseDate = Date | string;

export function parseDatabaseDate(value: DatabaseDate) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new TypeError("Database returned an invalid date value");
  return date;
}
