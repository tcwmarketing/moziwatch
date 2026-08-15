export type CampgroundOperationalStatus =
  "active" | "seasonal" | "closed" | "review";

export function campgroundOperationalStatusLabel(
  status: CampgroundOperationalStatus | string | null | undefined,
) {
  if (status === "active") return "Listed as open";
  if (status === "seasonal") return "Seasonal operation";
  if (status === "closed") return "Closed";
  return "Operating status unconfirmed";
}
