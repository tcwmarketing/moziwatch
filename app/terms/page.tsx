import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms for using MoziWatch campground reports, forecasts, accounts, donations, and product links.",
  alternates: { canonical: absoluteUrl("/terms") },
};

export default function TermsPage() {
  return (
    <div className="content-page prose-page">
      <p className="eyebrow">Terms of Service</p>
      <h1>Terms for using MoziWatch</h1>
      <p>
        <strong>Effective and last updated: July 22, 2026.</strong>
      </p>
      <p>
        These Terms of Service (“Terms”) are an agreement between you and The
        Complete Web Designer, operator of MoziWatch (“MoziWatch,” “we,” “us,”
        or “our”). They govern your use of moziwatch.com and its accounts,
        campground directory, map, reports, ratings, forecasts, donations,
        product suggestions, and related features (collectively, the “Service”).
        By using the Service, creating an account, or submitting content, you
        agree to these Terms and the <Link href="/privacy">Privacy Policy</Link>
        . If you do not agree, do not use the Service.
      </p>

      <section>
        <h2>1. Eligibility and accounts</h2>
        <p>
          You must be at least 13 to create an account. If you have not reached
          the age of majority where you live, use the Service only with a parent
          or legal guardian’s permission. You must provide accurate account
          information, keep your credentials confidential, and promptly notify
          us of suspected unauthorized access. You are responsible for activity
          through your account unless applicable law provides otherwise.
        </p>
        <p>
          We may require email verification, limit account features, revoke
          sessions, or suspend, ban, or delete an account when reasonably needed
          to protect the Service, enforce these Terms, respond to abuse, or
          comply with law. You may update or delete your account from your
          profile. Account deletion does not necessarily remove campground
          reports that have been de-identified and disconnected from the
          account.
        </p>
      </section>

      <section>
        <h2>2. Camper reports and other submissions</h2>
        <p>
          Submit only mosquito conditions you genuinely observed and information
          you reasonably believe is accurate. A report rating is subjective; it
          must not be presented as an official count or scientific observation.
          Do not include another person’s personal information, confidential
          information, advertising, links, impersonation, harassment, threats,
          illegal content, or material that infringes another person’s rights.
          The same rules apply to contact messages, campground suggestions, and
          corrections.
        </p>
        <p>
          You retain ownership of content you submit. You grant MoziWatch a
          non-exclusive, worldwide, royalty-free licence to host, store,
          reproduce, display, moderate, format, aggregate, analyze, and use that
          content as reasonably necessary to operate and improve the Service.
          For campground reports, this includes calculating observed ratings,
          producing brief report summaries, and using eligible reports as a
          transparent evidence stream in versioned forecasts. This licence may
          be sublicensed to service providers only as needed to operate the
          Service and continues for de-identified or aggregated material after
          account deletion.
        </p>
        <p>
          We may automatically flag or manually review submissions and may edit
          formatting, hide, reject, mark as spam, or delete content. We are not
          required to publish a submission or to preserve it indefinitely.
          Duplicate, rejected, deleted, or invalid reports are not intended to
          influence published report ratings or forecasts.
        </p>
      </section>

      <section>
        <h2>3. Reports, ratings, and mosquito forecasts</h2>
        <p>
          MoziWatch’s primary evidence is subjective reporting from campers.
          “Recent” and historical observed ratings summarize eligible published
          reports. Forecasts are separate, approximate model outputs that may
          combine weather, recent weather history, habitat estimates, recent
          user reports, and historical seasonal reports. A forecast never
          replaces an observed rating.
        </p>
        <p>
          Forecast models and thresholds are experimental, may change between
          versions, and may have incomplete habitat, weather, or report data.
          They are not trained mosquito-count models and are not mosquito-trap,
          disease-transmission, public-health, or pest-control surveillance.
          Confidence labels describe the amount and consistency of available
          evidence; they are not probabilities that a forecast is correct.
        </p>
        <p>
          Conditions can change quickly and vary within a campground. Use the
          information as one planning aid and bring protection appropriate for
          your needs. The Service is not medical, public-health, emergency,
          weather-warning, or professional pest-control advice. Consult official
          weather, health, fire, park, and emergency sources when safety
          matters.
        </p>
      </section>

      <section>
        <h2>4. Campground, map, weather, and third-party data</h2>
        <p>
          Campground names, types, addresses, coordinates, campsite counts,
          operational status, contact details, and other directory information
          may come from public agencies, open datasets, campground operators,
          community suggestions, or automated imports. Map and habitat data may
          come from Protomaps, OpenStreetMap contributors, Overture Maps,
          government datasets, and other sources identified on our{" "}
          <Link href="/data-sources">Data Sources page</Link>. Weather and place
          search data are supplied by Open-Meteo and underlying weather-data
          providers.
        </p>
        <p>
          Data may be incomplete, outdated, duplicated, misplaced, or wrong.
          Campsites may be closed, private, inaccessible, or subject to
          reservation and permit rules. Always confirm important details with
          the campground operator or responsible public agency before travel.
          Third-party data remains subject to its source licence, terms, and
          attribution requirements. No licence is granted to extract or reuse a
          third-party dataset beyond what its owner permits.
        </p>
      </section>

      <section>
        <h2>5. Donations</h2>
        <p>
          Donations are voluntary contributions supporting the venture. They do
          not purchase a subscription, campground access, additional website
          features, influence over reports, or a charitable tax receipt.
          Donations are processed through Stripe and may be subject to Stripe’s
          terms and fraud controls.
        </p>
        <p>
          A completed donation is generally final except where a refund is
          required by law or we agree to correct a duplicate, unauthorized, or
          erroneous transaction. Use the{" "}
          <Link href="/contact">Contact Us form</Link> promptly if you believe a
          payment was made in error. Processing fees and payment-method rules
          may affect whether and how a refund can be completed.
        </p>
      </section>

      <section>
        <h2>6. Suggested products and affiliate links</h2>
        <p>
          Product suggestions are general information, not medical advice or a
          guarantee that a product is safe, suitable, available, effective, or
          correctly described. Product details, prices, ratings, sellers, and
          availability can change. Read the current label and manufacturer
          directions and consider age, allergies, pets, pregnancy, local rules,
          and other personal circumstances before use.
        </p>
        <p>
          Some links are paid affiliate links. As an Amazon Associate I earn
          from qualifying purchases. MoziWatch may receive a commission without
          increasing the price you pay. Amazon and its sellers—not MoziWatch—are
          responsible for orders, payment, delivery, returns, warranties, and
          customer service. An affiliate relationship does not mean Amazon or a
          product manufacturer sponsors or endorses MoziWatch.
        </p>
      </section>

      <section>
        <h2>7. Acceptable use</h2>
        <p>You must not:</p>
        <ul>
          <li>submit fraudulent, manipulated, or misleading reports;</li>
          <li>
            evade duplicate controls, rate limits, moderation, bans, access
            controls, or security measures;
          </li>
          <li>
            access another person’s account or attempt to discover credentials,
            tokens, source secrets, or non-public data;
          </li>
          <li>
            scrape, crawl, copy, resell, or place unreasonable load on the
            Service except as permitted in writing or by applicable law;
          </li>
          <li>
            upload malware, interfere with operation, probe for vulnerabilities,
            or use the Service to spam, harass, defraud, or break the law; or
          </li>
          <li>
            misrepresent MoziWatch data, forecasts, or third-party data as your
            own official or scientific product.
          </li>
        </ul>
      </section>

      <section>
        <h2>8. Intellectual property</h2>
        <p>
          Except for user submissions and identified third-party material, the
          MoziWatch name, website design, original text, software, forecast
          configuration, and other Service content are owned by The Complete Web
          Designer or its licensors and are protected by applicable laws. These
          Terms give you a limited, revocable, non-transferable right to use the
          Service for its intended personal purpose. They do not transfer
          ownership or grant rights to MoziWatch or third-party trademarks,
          datasets, maps, images, or software.
        </p>
      </section>

      <section>
        <h2>9. Third-party services and links</h2>
        <p>
          The Service depends on or links to third parties, including Supabase,
          Stripe, Brevo, Google, Meta, Protomaps, Open-Meteo, Amazon, and public
          data providers. Their services are governed by their own terms and
          privacy policies. We do not control and are not responsible for a
          third party’s content, availability, data practices, products, or
          transactions. A link or integration does not imply endorsement unless
          we expressly say otherwise.
        </p>
      </section>

      <section>
        <h2>10. Service availability and changes</h2>
        <p>
          We may add, change, pause, restrict, or discontinue any part of the
          Service, data source, model, or account feature. We do not promise
          continuous availability, complete geographic coverage, permanent
          preservation of content, or compatibility with every device. We may
          correct errors without notice and may perform maintenance or
          processing that temporarily affects performance.
        </p>
      </section>

      <section>
        <h2>11. Disclaimers</h2>
        <p>
          To the maximum extent permitted by law, the Service is provided “as
          is” and “as available,” without warranties of accuracy, completeness,
          timeliness, availability, fitness for a particular purpose,
          merchantability, non-infringement, or results. We do not warrant that
          reports are genuine, that forecasts or weather will be correct, that
          campground information is current, or that a suggested product will
          prevent bites or illness. Nothing in these Terms excludes a warranty
          or consumer right that cannot legally be excluded.
        </p>
      </section>

      <section>
        <h2>12. Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, The Complete Web Designer and
          MoziWatch will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive loss, loss of data, lost
          opportunity, travel costs, campground closure, product issue, insect
          exposure, illness, injury, or damage arising from reliance on or use
          of the Service. This limitation does not apply where liability cannot
          legally be limited, including liability that applicable law assigns
          regardless of these Terms.
        </p>
      </section>

      <section>
        <h2>13. Responsibility for misuse</h2>
        <p>
          To the extent permitted by law, you are responsible for losses and
          reasonable costs arising from your unlawful use of the Service, your
          violation of these Terms, or content you submit that violates another
          person’s rights. This does not require you to cover a loss caused by
          our own unlawful conduct.
        </p>
      </section>

      <section>
        <h2>14. Governing law and disputes</h2>
        <p>
          These Terms are governed by the laws of British Columbia and the
          applicable federal laws of Canada, without regard to conflict-of-law
          rules. Subject to any mandatory consumer or local law that applies to
          you, disputes may be brought in the courts of British Columbia. Before
          filing a claim, please use the{" "}
          <Link href="/contact">Contact Us form</Link> so we have a reasonable
          opportunity to resolve the issue informally.
        </p>
      </section>

      <section>
        <h2>15. General terms</h2>
        <p>
          If a provision is unenforceable, the remaining provisions continue in
          effect. Our failure to enforce a provision is not a waiver. You may
          not transfer these Terms without our consent; we may transfer them in
          connection with a reorganization or transfer of the Service. These
          Terms and the Privacy Policy are the agreement between you and us
          about the Service, except for additional terms clearly presented for a
          specific feature.
        </p>
      </section>

      <section>
        <h2>16. Changes and contact</h2>
        <p>
          We may update these Terms when the Service, providers, or legal
          requirements change. The current version will be posted here with its
          effective date. We will provide additional notice when required. Your
          continued use after an update takes effect means you accept the
          updated Terms. If you do not agree, stop using the Service and delete
          your account.
        </p>
        <p>
          Questions about these Terms can be submitted through the{" "}
          <Link href="/contact">Contact Us form</Link>.
        </p>
      </section>
    </div>
  );
}
