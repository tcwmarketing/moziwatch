"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCampgroundPrefetch } from "@/components/campground-prefetch-link";
import type { CampgroundDirectoryFilters as DirectoryFilterValues } from "@/lib/campground-directory";

type SearchSuggestion = {
  id: string;
  name: string;
  slug: string;
  location: string;
};

type Props = {
  filters: DirectoryFilterValues;
  regions: string[];
};

function usableLocation(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    (Math.abs(latitude) > 0.01 || Math.abs(longitude) > 0.01)
  );
}

export function CampgroundDirectoryFilters({ filters, regions }: Props) {
  const router = useRouter();
  const prefetchCampground = useCampgroundPrefetch();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchValue, setSearchValue] = useState(filters.query);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const campgroundValue = filters.locationType
    ? `type:${filters.locationType}`
    : filters.scope;
  const activeFilterCount = [
    campgroundValue !== "all",
    filters.period !== "recent",
    filters.country !== "all",
    Boolean(filters.region),
    Boolean(filters.severity),
    filters.forecast !== "all",
  ].filter(Boolean).length;
  const [expanded, setExpanded] = useState(activeFilterCount > 0);

  useEffect(() => {
    const query = searchValue.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(
        `/api/campgrounds/search-suggestions?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      ).catch(() => null);
      if (!response?.ok) return;
      const result = (await response.json()) as {
        suggestions: SearchSuggestion[];
      };
      setSuggestions(result.suggestions);
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchValue]);

  useEffect(() => {
    if (filters.latitude !== null || !navigator.geolocation) {
      return;
    }
    sessionStorage.removeItem("moziwatch-nearby-location");
    const saved = sessionStorage.getItem("moziwatch-nearby-location-v2");
    const applyLocation = (location: {
      lat: number;
      lon: number;
      capturedAt: number;
    }) => {
      sessionStorage.setItem(
        "moziwatch-nearby-location-v2",
        JSON.stringify(location),
      );
      const params = new URLSearchParams(searchParams.toString());
      params.set("lat", location.lat.toFixed(5));
      params.set("lon", location.lon.toFixed(5));
      if (!params.has("sort")) params.set("sort", "distance_asc");
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };
    const loadHostingLocation = async () => {
      const response = await fetch("/api/location", {
        signal: controller.signal,
      }).catch(() => null);
      if (!response?.ok) return;
      const result = (await response.json()) as {
        latitude?: number;
        longitude?: number;
      };
      if (!usableLocation(result.latitude ?? 0, result.longitude ?? 0)) return;
      applyLocation({
        lat: result.latitude!,
        lon: result.longitude!,
        capturedAt: Date.now(),
      });
    };
    const controller = new AbortController();
    if (saved) {
      try {
        const location = JSON.parse(saved) as {
          lat: number;
          lon: number;
          capturedAt: number;
        };
        if (
          usableLocation(location.lat, location.lon) &&
          Date.now() - location.capturedAt < 60 * 60 * 1000
        ) {
          applyLocation(location);
          return;
        }
      } catch {
        sessionStorage.removeItem("moziwatch-nearby-location-v2");
      }
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!usableLocation(coords.latitude, coords.longitude)) {
          sessionStorage.removeItem("moziwatch-nearby-location-v2");
          void loadHostingLocation();
          return;
        }
        const location = {
          lat: coords.latitude,
          lon: coords.longitude,
          capturedAt: Date.now(),
        };
        applyLocation(location);
      },
      () => void loadHostingLocation(),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 300_000 },
    );
    return () => controller.abort();
  }, [filters.latitude, pathname, router, searchParams]);

  return (
    <form method="get" className="directory-filters content-card">
      {filters.latitude !== null && filters.longitude !== null ? (
        <>
          <input type="hidden" name="lat" value={filters.latitude} />
          <input type="hidden" name="lon" value={filters.longitude} />
        </>
      ) : null}
      <div className="directory-filter-primary">
        <div className="directory-search-control">
          <label htmlFor="directory-search">Search</label>
          <span className="directory-search-field">
            <input
              id="directory-search"
              name="q"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                if (event.target.value.trim().length < 2) setSuggestions([]);
              }}
              onBlur={() => window.setTimeout(() => setSuggestions([]), 140)}
              autoComplete="off"
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-controls="directory-search-suggestions"
              placeholder="Name, city or region"
              onKeyDown={(event) => {
                if (event.key === "Enter" && suggestions[0]) {
                  event.preventDefault();
                  router.push(`/campgrounds/${suggestions[0].slug}`);
                }
              }}
            />
            <button type="submit">Go</button>
          </span>
          {searchValue.trim().length >= 2 && suggestions.length ? (
            <ul
              className="directory-search-suggestions"
              id="directory-search-suggestions"
              role="listbox"
            >
              {suggestions.map((suggestion) => (
                <li key={suggestion.id} role="option" aria-selected="false">
                  <button
                    type="button"
                    onPointerDown={(event) => event.preventDefault()}
                    onMouseEnter={() =>
                      prefetchCampground(`/campgrounds/${suggestion.slug}`)
                    }
                    onFocus={() =>
                      prefetchCampground(`/campgrounds/${suggestion.slug}`)
                    }
                    onTouchStart={() =>
                      prefetchCampground(`/campgrounds/${suggestion.slug}`)
                    }
                    onClick={() => {
                      setSuggestions([]);
                      router.push(`/campgrounds/${suggestion.slug}`);
                    }}
                  >
                    <strong>{suggestion.name}</strong>
                    <span>{suggestion.location}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <label>
          Sort
          <select
            name="sort"
            defaultValue={filters.sort}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            <option value="severity_asc">Severity: lowest first</option>
            <option value="severity_desc">Severity: highest first</option>
            <option value="distance_asc" disabled={filters.latitude === null}>
              Distance: nearest first
            </option>
            <option value="name_asc">Name: A to Z</option>
            <option value="reports_desc">Most reports</option>
          </select>
        </label>
        <button
          className="directory-filter-toggle"
          type="button"
          aria-expanded={expanded}
          aria-controls="directory-filter-options"
          onClick={() => setExpanded((current) => !current)}
        >
          Filter
          {activeFilterCount ? (
            <span aria-label={`${activeFilterCount} active filters`}>
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <div
        className="directory-filter-options"
        id="directory-filter-options"
        hidden={!expanded}
      >
        <label>
          Campgrounds
          <select name="campgrounds" defaultValue={campgroundValue}>
            <option value="all">All campgrounds</option>
            <option value="major">Major campgrounds</option>
            <option value="type:developed_campground">
              Developed campgrounds
            </option>
            <option value="type:rv_park">RV parks</option>
            <option value="type:group_campground">Group campgrounds</option>
            <option value="type:backcountry_campground">
              Backcountry campgrounds
            </option>
            <option value="type:other_established_campground">
              Rustic recreation sites
            </option>
          </select>
        </label>
        <label>
          Report period
          <select name="period" defaultValue={filters.period}>
            <option value="recent">Recent</option>
            <option value="historical">Historical</option>
          </select>
        </label>
        <label>
          Country
          <select name="country" defaultValue={filters.country}>
            <option value="all">Canada and United States</option>
            <option value="CA">Canada</option>
            <option value="US">United States</option>
          </select>
        </label>
        <label>
          Region
          <select name="region" defaultValue={filters.region}>
            <option value="">All regions</option>
            {regions.map((region) => (
              <option value={region} key={region}>
                {region}
              </option>
            ))}
          </select>
        </label>
        <label>
          Report severity
          <select name="severity" defaultValue={filters.severity}>
            <option value="">All severities</option>
            <option value="low">No mosquitoes to light</option>
            <option value="moderate">Moderate</option>
            <option value="high">Heavy</option>
            <option value="severe">Severe</option>
            <option value="none">No reports</option>
          </select>
        </label>
        <label>
          Forecast
          <select name="forecast" defaultValue={filters.forecast}>
            <option value="all">With or without forecast</option>
            <option value="available">Forecast available</option>
            <option value="unavailable">Forecast unavailable</option>
          </select>
        </label>
        <div className="directory-filter-actions">
          <button className="button primary" type="submit">
            Apply filters
          </button>
          <Link href="/campgrounds">Reset</Link>
        </div>
      </div>
    </form>
  );
}
