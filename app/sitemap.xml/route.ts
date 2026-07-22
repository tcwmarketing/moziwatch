import { sqlClient } from "@/db";
import { publicEnv } from "@/lib/env";
import { buildSitemapXml, type SitemapXmlEntry } from "@/lib/sitemap-xml";

export const revalidate = 86_400;

const staticPaths = [
  "",
  "/campgrounds",
  "/products",
  "/support",
  "/about",
  "/contact",
  "/data-sources",
  "/privacy",
  "/terms",
];

export async function GET() {
  const base = publicEnv.appUrl.replace(/\/$/, "");
  const staticPages: SitemapXmlEntry[] = staticPaths.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path ? "monthly" : "daily",
    priority: path ? 0.5 : 1,
  }));

  let entries = staticPages;
  try {
    const campgrounds = await sqlClient<
      { slug: string; updated_at: Date }[]
    >`SELECT slug, updated_at FROM campgrounds WHERE active = true`;
    entries = [
      ...staticPages,
      ...campgrounds.map((campground) => ({
        url: `${base}/campgrounds/${campground.slug}`,
        lastModified: campground.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    // Keep the essential static sitemap available during a database outage.
  }

  return new Response(buildSitemapXml(entries), {
    headers: {
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}
