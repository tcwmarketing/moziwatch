import type { Metadata } from "next";
import { DonationForm } from "@/components/donation-form";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Support the venture",
  description:
    "Support MoziWatch's independent campground mosquito reporting project.",
  alternates: { canonical: absoluteUrl("/support") },
};

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const status = (await searchParams).status;
  return (
    <div className="content-page support-page">
      <div className="support-intro">
        <p className="eyebrow">Support the venture</p>
        <h1>Help campers arrive prepared</h1>
        <p>
          We are building an authoritative, practical source for mosquito
          conditions at campgrounds—combining current camper reports with
          transparent forecasts so people know what to pack before they leave
          home.
        </p>
        <p>
          Contributions help cover mapping, weather, data processing and the
          less glamorous work of keeping thousands of campground records
          accurate. Small amounts genuinely help; there is no subscription or
          expectation.
        </p>
      </div>
      {status === "unavailable" ? (
        <p className="notice">
          Donations are not available just yet. Please check back soon.
        </p>
      ) : null}
      {status === "invalid" ? (
        <p className="notice">Choose an amount from $1 to $500.</p>
      ) : null}
      <DonationForm />
    </div>
  );
}
