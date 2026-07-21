import type { Metadata } from "next";
import { sqlClient } from "@/db";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Data sources",
  description:
    "Review the campground, mapping, weather and habitat data sources used by MoziWatch.",
  alternates: { canonical: absoluteUrl("/data-sources") },
};

const locationSources = [
  [
    "overture-ca",
    "Overture Places",
    "United States and Canada outside British Columbia",
    "Overture record-level source licences",
    "Monthly",
    "https://docs.overturemaps.org/guides/places/",
  ],
  [
    "parks-canada",
    "Parks Canada accommodations",
    "Federal campgrounds outside British Columbia",
    "Open Government Licence - Canada",
    "Weekly",
    "https://open.canada.ca/data/en/dataset/85d09f00-b645-4413-bd51-dea2846d9d98",
  ],
  [
    "quebec-tourism",
    "Quebec tourism syndication",
    "Registered Quebec campgrounds",
    "CC BY 4.0",
    "Weekly",
    "https://www.donneesquebec.ca/",
  ],
  [
    "nova-scotia-parks",
    "Nova Scotia Provincial Park Entrances",
    "Nova Scotia provincial camping parks",
    "Open Government Licence - Nova Scotia",
    "Monthly",
    "https://data.novascotia.ca/datasets/c6mf-qy4u",
  ],
  [
    "ridb",
    "RIDB / Recreation.gov",
    "U.S. federal camping facilities",
    "RIDB API Access Agreement",
    "Weekly",
    "https://ridb.recreation.gov/",
  ],
  [
    "nps",
    "National Park Service",
    "NPS campground gap enrichment",
    "U.S. government work / NPS API terms",
    "Weekly when configured",
    "https://www.nps.gov/subjects/developer/api-documentation.htm",
  ],
  [
    "usfs",
    "USDA Forest Service",
    "USFS campground gap enrichment",
    "U.S. government work / USDA data disclaimer",
    "Weekly",
    "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer",
  ],
];

export default async function DataSourcesPage() {
  const lastSync = new Map<string, Date>();
  try {
    const rows = await sqlClient<{ source: string; completed_at: Date }[]>`
      SELECT DISTINCT ON (source) source, completed_at
      FROM location_import_runs
      WHERE status = 'completed' AND dry_run = false
      ORDER BY source, completed_at DESC
    `;
    for (const row of rows)
      if (row.completed_at) lastSync.set(row.source, row.completed_at);
  } catch {
    // Keep setup and outage rendering independent from database availability.
  }
  return (
    <div className="content-page">
      <header className="page-heading">
        <p className="eyebrow">Transparency</p>
        <h1>Data sources</h1>
        <p>
          Campground location sources are stored separately from user reports,
          weather, forecasts, and the map basemap.
        </p>
      </header>
      <section className="content-card">
        <h2>Campground locations</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Coverage</th>
                <th>Licence</th>
                <th>Schedule</th>
                <th>Last production sync</th>
              </tr>
            </thead>
            <tbody>
              {locationSources.map(
                ([key, source, coverage, licence, sync, url]) => (
                  <tr key={key}>
                    <th scope="row">
                      <a href={url}>{source}</a>
                    </th>
                    <td>{coverage}</td>
                    <td>{licence}</td>
                    <td>{sync}</td>
                    <td>
                      {(
                        lastSync.get(key) ||
                        (key === "overture-ca"
                          ? lastSync.get("overture-us")
                          : undefined)
                      )?.toLocaleString() || "Not yet synced"}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p>
          Each campground detail page lists the source records linked to that
          location. The database retains source and record URLs, extracted
          contact emails and links, release and update times, first and last
          seen times, and the record hash. Licence and attribution are retained
          once per provider.
        </p>
      </section>
      <section className="content-card">
        <h2>Map and weather</h2>
        <p>
          Basemap by Protomaps and OpenStreetMap contributors. Forecast weather
          by Open-Meteo. Modeled mosquito forecasts remain separate from
          camper-submitted observations.
        </p>
      </section>
    </div>
  );
}
