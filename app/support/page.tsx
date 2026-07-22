import Link from "next/link";
import Image from "next/image";
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
      <section className="support-trust" aria-labelledby="support-trust-title">
        <div>
          <p className="eyebrow">Support with confidence</p>
          <h2 id="support-trust-title">
            A small contribution with a clear use
          </h2>
        </div>
        <div className="support-trust-grid">
          <article>
            <h3>Secure payment</h3>
            <p>
              Payment details are entered on Stripe&apos;s hosted checkout.
              MoziWatch does not receive or store your full card number.
            </p>
          </article>
          <article>
            <h3>No recurring charge</h3>
            <p>
              This is a one-time voluntary donation—not a subscription or an
              ongoing commitment.
            </p>
          </article>
          <article>
            <h3>Practical project costs</h3>
            <p>
              Donations help pay for mapping, weather processing, campground
              data maintenance and the services needed to keep MoziWatch online.
            </p>
          </article>
        </div>
      </section>
      <section className="support-founder content-card">
        <Image
          className="support-founder-photo"
          src="/clinton-dixson.webp"
          alt="Clinton, founder of MoziWatch"
          width={800}
          height={1201}
          sizes="(max-width: 760px) 132px, 160px"
        />
        <div>
          <p className="eyebrow">Who is behind MoziWatch?</p>
          <h2>Hi, my name is Clinton</h2>
          <p>
            I built this website because it answers a question our family has
            every time we go camping. How bad are the mosquitoes and how much
            bug spray do we need? If we ask the question, I figured others do as
            well, and there isn&apos;t a good place to find the answer. I hope
            others will support this idea and we, as a community, can help each
            other be prepared for those pesky bugs on the next camping
            adventure. Thanks.
          </p>
          <div className="support-founder-links">
            <a
              href="https://www.facebook.com/ClintonDixson"
              target="_blank"
              rel="me noopener noreferrer"
            >
              Clinton on Facebook
            </a>
            <Link href="/about">See how MoziWatch works</Link>
            <Link href="/contact">Contact MoziWatch</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
