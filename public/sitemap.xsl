<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"
  exclude-result-prefixes="sm"
>
  <xsl:output method="html" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>MoziWatch XML Sitemap</title>
        <style>
          :root {
            color-scheme: light;
            --green: #0b5149;
            --green-dark: #073e38;
            --gold: #edae12;
            --cream: #fbfaf5;
            --ink: #153f3a;
            --muted: #5f746f;
            --line: #d9e2df;
          }

          * { box-sizing: border-box; }

          body {
            margin: 0;
            background: var(--cream);
            color: var(--ink);
            font-family: Montserrat, Inter, ui-sans-serif, system-ui, -apple-system,
              BlinkMacSystemFont, "Segoe UI", sans-serif;
          }

          header {
            background: linear-gradient(135deg, var(--green-dark), var(--green));
            color: white;
          }

          .header-inner,
          main {
            width: min(1180px, calc(100% - 32px));
            margin: 0 auto;
          }

          .header-inner {
            min-height: 112px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 24px;
            padding: 22px 0;
          }

          .brand {
            display: flex;
            align-items: center;
            gap: 14px;
          }

          .brand img {
            width: 62px;
            height: 62px;
            border-radius: 16px;
            background: white;
            object-fit: contain;
          }

          .brand strong {
            display: block;
            font-size: clamp(1.4rem, 3vw, 2rem);
            line-height: 1.1;
          }

          .brand span {
            display: block;
            margin-top: 5px;
            color: #dcece8;
            font-size: 0.9rem;
          }

          .home-link {
            flex: 0 0 auto;
            border: 1px solid rgba(255, 255, 255, 0.45);
            border-radius: 999px;
            padding: 10px 16px;
            color: white;
            font-size: 0.9rem;
            font-weight: 700;
            text-decoration: none;
          }

          .home-link:hover { background: rgba(255, 255, 255, 0.12); }

          main { padding: 36px 0 64px; }

          .intro {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 24px;
            align-items: end;
            margin-bottom: 22px;
          }

          h1 {
            margin: 0 0 8px;
            color: var(--green-dark);
            font-size: clamp(1.8rem, 4vw, 2.7rem);
          }

          p { margin: 0; color: var(--muted); line-height: 1.65; }

          .count {
            border-radius: 14px;
            background: #fff2c7;
            color: #684900;
            padding: 10px 14px;
            font-size: 0.9rem;
            font-weight: 800;
            white-space: nowrap;
          }

          .table-wrap {
            overflow: hidden;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: white;
            box-shadow: 0 16px 45px rgba(7, 62, 56, 0.08);
          }

          table { width: 100%; border-collapse: collapse; }

          th,
          td {
            padding: 14px 18px;
            border-bottom: 1px solid #e9efed;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #eff6f3;
            color: var(--green-dark);
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }

          td { color: var(--muted); font-size: 0.88rem; }
          tr:last-child td { border-bottom: 0; }
          tbody tr:hover { background: #fbfdfc; }

          td:first-child { width: 64%; }

          td a {
            color: var(--green);
            font-weight: 700;
            overflow-wrap: anywhere;
            text-decoration: none;
          }

          td a:hover { text-decoration: underline; }

          footer {
            padding: 24px 16px;
            background: var(--green-dark);
            color: #dcece8;
            text-align: center;
            font-size: 0.8rem;
          }

          @media (max-width: 720px) {
            .header-inner,
            .intro { align-items: flex-start; }

            .header-inner { min-height: 0; }
            .brand span { display: none; }
            .home-link { padding: 8px 12px; }
            .intro { grid-template-columns: 1fr; }
            .count { justify-self: start; }
            .table-wrap { overflow-x: auto; }
            table { min-width: 680px; }
            th,
            td { padding: 12px 14px; }
          }
        </style>
      </head>
      <body>
        <header>
          <div class="header-inner">
            <div class="brand">
              <img src="/moziwatch-icon.webp" alt="" />
              <div>
                <strong>MoziWatch</strong>
                <span>Campground mosquito reports and forecasts</span>
              </div>
            </div>
            <a class="home-link" href="/">Visit MoziWatch</a>
          </div>
        </header>

        <main>
          <div class="intro">
            <div>
              <h1>XML Sitemap</h1>
              <p>
                This page helps search engines discover MoziWatch campground
                reports, forecasts and visitor information.
              </p>
            </div>
            <div class="count">
              <xsl:value-of select="count(/sm:urlset/sm:url)" /> URLs
            </div>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Page</th>
                  <th>Updated</th>
                  <th>Frequency</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="/sm:urlset/sm:url">
                  <tr>
                    <td>
                      <a>
                        <xsl:attribute name="href">
                          <xsl:value-of select="sm:loc" />
                        </xsl:attribute>
                        <xsl:value-of select="sm:loc" />
                      </a>
                    </td>
                    <td>
                      <xsl:choose>
                        <xsl:when test="sm:lastmod">
                          <xsl:value-of select="substring(sm:lastmod, 1, 10)" />
                        </xsl:when>
                        <xsl:otherwise>—</xsl:otherwise>
                      </xsl:choose>
                    </td>
                    <td><xsl:value-of select="sm:changefreq" /></td>
                    <td><xsl:value-of select="sm:priority" /></td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
        </main>

        <footer>
          MoziWatch — Check mosquito conditions before arriving at the campground.
        </footer>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
