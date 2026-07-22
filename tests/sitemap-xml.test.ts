import { describe, expect, it } from "vitest";
import { buildSitemapXml } from "@/lib/sitemap-xml";

describe("sitemap XML", () => {
  it("includes the human-readable stylesheet without changing sitemap semantics", () => {
    const xml = buildSitemapXml([
      {
        url: "https://moziwatch.com/campgrounds/bear-creek?a=1&b=2",
        lastModified: new Date("2026-07-21T12:30:00Z"),
        changeFrequency: "weekly",
        priority: 0.8,
      },
    ]);

    expect(xml).toContain(
      '<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>',
    );
    expect(xml).toContain(
      "<loc>https://moziwatch.com/campgrounds/bear-creek?a=1&amp;b=2</loc>",
    );
    expect(xml).toContain("<lastmod>2026-07-21T12:30:00.000Z</lastmod>");
    expect(xml).toContain("<changefreq>weekly</changefreq>");
    expect(xml).toContain("<priority>0.8</priority>");
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
  });

  it("omits invalid optional dates", () => {
    expect(
      buildSitemapXml([
        { url: "https://moziwatch.com", lastModified: "not-a-date" },
      ]),
    ).not.toContain("<lastmod>");
  });
});
