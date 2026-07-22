import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How MoziWatch protects campground report and account data.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function PrivacyPage() {
  return (
    <div className="content-page prose-page">
      <p className="eyebrow">Plain-language privacy</p>
      <h1>Your report should help campers, not identify you.</h1>
      <section>
        <h2>Anonymous reporting</h2>
        <p>
          We place a random first-party reporter token in a secure, HTTP-only
          browser cookie. It is not a fingerprint and does not track you across
          sites. We store only a protected, one-way version of that token.
        </p>
      </section>
      <section>
        <h2>IP addresses</h2>
        <p>
          Your network address is normalized on the server and immediately
          converted into a protected one-way value. We do not store the raw
          address. The protected value is used for duplicate prevention and
          general abuse limits. Trusted proxy headers are used only when the
          operator configures an exact proxy count.
        </p>
      </section>
      <section>
        <h2>Accounts</h2>
        <p>
          Accounts contain a name, email address, authentication records, saved
          campgrounds, and reports. Email accounts must be verified. Google and
          Facebook are asked only for name and email. If a provider does not
          confirm the email, we require our own verification.
        </p>
      </section>
      <section>
        <h2>Donations</h2>
        <p>
          Donations are processed by Stripe on its hosted checkout page. We
          retain the donation amount, currency, payment status, Stripe checkout
          identifiers, and the donor email returned with a completed payment. We
          do not receive or store your full payment-card details. Stripe
          processes payment information under its own privacy policy.
        </p>
      </section>
      <section>
        <h2>Analytics and tag management</h2>
        <p>
          We use Google Tag Manager to load and manage approved website
          measurement tools. Those tools may receive page URLs and technical
          information about your browser or device under their own privacy
          terms. Tag Manager does not change how campground reports or account
          information are stored by MoziWatch.
        </p>
      </section>
      <section>
        <h2>Spam and abuse protection</h2>
        <p>
          Public report, contact, and campground-suggestion forms use Google
          reCAPTCHA Enterprise to assess automated abuse. Google receives the
          generated action token and technical request information such as the
          browser user agent and network address. Its use is governed by the{" "}
          <a href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>{" "}
          and <a href="https://policies.google.com/terms">Terms of Service</a>.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Published reports may be retained to preserve campground history. If
          you delete your account, the account and sessions are removed and your
          reports are permanently disconnected from it. The anonymized reports
          may remain. Moderation and administrative audit records are retained
          for security and accountability.
        </p>
      </section>
      <section>
        <h2>Questions</h2>
        <p>
          Privacy questions and deletion requests can be submitted through the
          Contact Us form. Email addresses are never published on the website.
        </p>
      </section>
    </div>
  );
}
