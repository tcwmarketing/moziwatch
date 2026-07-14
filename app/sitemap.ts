import type { MetadataRoute } from "next";
import { sqlClient } from "@/db";
import { publicEnv } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.appUrl.replace(/\/$/, "");
  const staticPages: MetadataRoute.Sitemap = [
    "",
    "/about",
    "/privacy",
    "/terms",
  ].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path ? "monthly" : "daily",
    priority: path ? 0.5 : 1,
  }));
  try {
    const campgrounds = await sqlClient<
      { slug: string; updated_at: Date }[]
    >`SELECT slug, updated_at FROM campgrounds WHERE active = true`;
    return [
      ...staticPages,
      ...campgrounds.map((campground) => ({
        url: `${base}/campgrounds/${campground.slug}`,
        lastModified: campground.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}
