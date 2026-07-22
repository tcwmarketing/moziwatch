import type { Metadata } from "next";
import Link from "next/link";
import { AdsenseUnit } from "@/components/adsense-unit";
import { CampgroundPrefetchLink } from "@/components/campground-prefetch-link";
import { CampgroundDirectoryFilters as DirectoryFilterControls } from "@/components/campground-directory-filters";
import { MosquitoRating } from "@/components/mosquito-rating";
import {
  getCampgroundDirectory,
  type CampgroundDirectoryFilters,
  type DirectorySort,
} from "@/lib/campground-directory";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Campground mosquito reports and forecasts",
  description:
    "Find campground mosquito reports and forecasts across Canada and the United States so you know what protection to pack.",
  alternates: { canonical: absoluteUrl("/campgrounds") },
};
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Search> };

function value(search: Search, key: string) {
  const item = search[key];
  return Array.isArray(item) ? item[0] || "" : item || "";
}

function coordinate(
  search: Search,
  key: string,
  minimum: number,
  maximum: number,
) {
  const raw = value(search, key).trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function pageHref(search: Search, page: number) {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(search)) {
    const current = Array.isArray(item) ? item[0] : item;
    if (current && key !== "page") params.set(key, current);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/campgrounds?${query}` : "/campgrounds";
}

export default async function CampgroundDirectoryPage({ searchParams }: Props) {
  const search = await searchParams;
  const sortValue = value(search, "sort");
  const campgroundValue = value(search, "campgrounds");
  const campgroundType = campgroundValue.startsWith("type:")
    ? campgroundValue.slice(5)
    : value(search, "type");
  const validCampgroundTypes = [
    "developed_campground",
    "rv_park",
    "group_campground",
    "backcountry_campground",
    "other_established_campground",
  ];
  const filters: CampgroundDirectoryFilters = {
    query: value(search, "q"),
    scope:
      campgroundValue === "major"
        ? "major"
        : campgroundValue === "all" ||
            validCampgroundTypes.includes(campgroundType)
          ? "all"
          : value(search, "scope") === "major"
            ? "major"
            : "all",
    period: value(search, "period") === "historical" ? "historical" : "recent",
    sort: [
      "severity_desc",
      "distance_asc",
      "name_asc",
      "reports_desc",
    ].includes(sortValue)
      ? (sortValue as DirectorySort)
      : "severity_asc",
    country: ["CA", "US"].includes(value(search, "country"))
      ? (value(search, "country") as "CA" | "US")
      : "all",
    region: value(search, "region"),
    locationType: validCampgroundTypes.includes(campgroundType)
      ? campgroundType
      : "",
    severity: value(search, "severity"),
    forecast: ["available", "unavailable"].includes(value(search, "forecast"))
      ? (value(search, "forecast") as "available" | "unavailable")
      : "all",
    latitude: coordinate(search, "lat", -90, 90),
    longitude: coordinate(search, "lon", -180, 180),
    page: Math.max(1, Number.parseInt(value(search, "page") || "1", 10) || 1),
  };
  const directory = await getCampgroundDirectory(filters);

  return (
    <div className="content-page campground-directory-page">
      <header className="directory-header">
        <div>
          <p className="eyebrow">Campground directory</p>
          <h1>Find mosquito conditions for your campground.</h1>
          <p>
            Search recent camper reports and available outlooks to decide what
            mosquito protection to bring.
          </p>
        </div>
      </header>

      <DirectoryFilterControls filters={filters} regions={directory.regions} />

      <div className="directory-results-heading">
        <h2>{directory.total.toLocaleString()} campgrounds</h2>
        <span>
          Page {directory.page} of {directory.pageCount}
        </span>
      </div>
      <AdsenseUnit className="adsense-directory" />
      {directory.rows.length ? (
        <ul className="campground-directory-list">
          {directory.rows.map((campground) => (
            <li key={campground.id}>
              <CampgroundPrefetchLink
                className="campground-directory-row"
                href={`/campgrounds/${campground.slug}`}
              >
                <MosquitoRating
                  average={campground.selected_average}
                  color={campground.severity.color}
                />
                <span className="directory-campground-identity">
                  <strong>{campground.name}</strong>
                  <span>
                    {campground.city}, {campground.region}
                    {campground.official_campsite_count !== null
                      ? ` · ${campground.official_campsite_count.toLocaleString()} site${campground.official_campsite_count === 1 ? "" : "s"}`
                      : " · Site count unavailable"}
                    {campground.distance_meters !== null
                      ? ` · ${Math.round(campground.distance_meters / 1000).toLocaleString()} km away`
                      : ""}
                  </span>
                </span>
              </CampgroundPrefetchLink>
            </li>
          ))}
        </ul>
      ) : (
        <p className="content-card empty-state">
          No campgrounds match these filters.
        </p>
      )}
      {directory.pageCount > 1 ? (
        <nav
          className="directory-pagination"
          aria-label="Campground directory pages"
        >
          {directory.page > 1 ? (
            <Link href={pageHref(search, directory.page - 1)}>Previous</Link>
          ) : (
            <span />
          )}
          <span>
            Page {directory.page} of {directory.pageCount}
          </span>
          {directory.page < directory.pageCount ? (
            <Link href={pageHref(search, directory.page + 1)}>Next</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
