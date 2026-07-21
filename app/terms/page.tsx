import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms for using MoziWatch campground reports and outlooks.",
  alternates: { canonical: absoluteUrl("/terms") },
};

export default function TermsPage() {
  return (
    <div className="content-page prose-page">
      <p className="eyebrow">Terms of use</p>
      <h1>Use the signal as guidance.</h1>
      <section>
        <h2>No safety guarantee</h2>
        <p>
          Camper reports are subjective and the approximate outlook can be
          incomplete or wrong. Conditions change quickly. This service is not
          medical, health, or emergency advice.
        </p>
      </section>
      <section>
        <h2>Your reports</h2>
        <p>
          Submit only conditions you personally observed. Do not include
          personal information, harassment, advertising, or unlawful content.
          Reports may be hidden or rejected to protect the usefulness of the
          service.
        </p>
      </section>
      <section>
        <h2>Data and maps</h2>
        <p>
          Basemap data, weather data, and other public datasets remain subject
          to their source licences and attribution requirements. You may not
          attempt to bypass rate limits, duplicate controls, or access
          restrictions.
        </p>
      </section>
      <section>
        <h2>Donations and product links</h2>
        <p>
          Donations are voluntary and do not purchase a subscription or affect
          access to campground information. Some product links are affiliate
          links. We may earn a commission from qualifying purchases without
          increasing the price you pay.
        </p>
      </section>
      <section>
        <h2>Production review</h2>
        <p>
          These starter terms must be reviewed for the operator&apos;s
          jurisdiction, contact details, dispute rules, and applicable consumer
          law before public launch.
        </p>
      </section>
    </div>
  );
}
