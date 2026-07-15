export function toPostgresJson(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError("Value cannot be represented as JSON");
  return serialized;
}
