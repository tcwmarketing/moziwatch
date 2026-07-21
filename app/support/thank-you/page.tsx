import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank you",
  robots: { index: false, follow: false },
};

export default function DonationThankYouPage() {
  return (
    <div className="content-page narrow-page">
      <section className="content-card thank-you-card">
        <p className="eyebrow">Thank you</p>
        <h1>Your support means a lot.</h1>
        <p>
          Your contribution helps us keep campground information useful, current
          and accessible.
        </p>
        <Link className="button primary" href="/">
          Return to the map
        </Link>
      </section>
    </div>
  );
}
