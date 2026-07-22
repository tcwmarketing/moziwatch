import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How MoziWatch collects, uses, shares, protects, and retains personal information.",
  alternates: { canonical: absoluteUrl("/privacy") },
};

export default function PrivacyPage() {
  return (
    <div className="content-page prose-page">
      <p className="eyebrow">Privacy Policy</p>
      <h1>How MoziWatch handles your information</h1>
      <p>
        <strong>Effective and last updated: July 22, 2026.</strong>
      </p>
      <p>
        MoziWatch is operated by The Complete Web Designer. This policy applies
        to moziwatch.com and the accounts, campground reports, forecasts,
        contact forms, location tools, donations, and other services available
        through the website (collectively, the “Service”).
      </p>

      <section>
        <h2>Information we collect</h2>
        <h3>Accounts and profiles</h3>
        <p>
          When you create an account, we collect your name, email address,
          password credential, verification status, account role, saved
          campgrounds, and account and session timestamps. Passwords are stored
          as one-way password hashes, not in readable form. Authentication
          sessions may contain an IP address and browser user-agent for account
          security.
        </p>
        <p>
          You may optionally save a home city. If you do, we store the place
          label, region, country, approximate latitude and longitude, and place
          identifier so that we can show nearby campgrounds. You can change or
          remove this information from your profile.
        </p>
        <p>
          If you choose Google or Facebook sign-in, we receive the provider
          account identifier and basic profile information the provider makes
          available for sign-in, such as your name, email address, verification
          status, and profile image. OAuth credentials are encrypted in our
          application database. Google and Meta separately process your use of
          their sign-in services under their own privacy policies.
        </p>

        <h3>Campground reports</h3>
        <p>
          A report contains the campground, mosquito rating, observation date,
          submission time, optional comment, moderation status, and spam-review
          results. If you are signed in, the report is associated with your
          account. Published ratings, dates, and comments may be shown publicly;
          your account name and email address are not displayed with them.
        </p>
        <p>
          You may also report anonymously. In that case, we place a random,
          first-party reporter token in a secure, HTTP-only browser cookie for
          up to one year and store only a protected one-way version of it. It is
          used to prevent duplicate submissions and is not designed to identify
          you or track you across other websites.
        </p>

        <h3>Contact messages and campground suggestions</h3>
        <p>
          Contact messages contain the name, email address, subject, and message
          you submit. A campground suggestion or correction may contain the
          campground, location details, coordinates, comments, and an optional
          reply email. These submissions are reviewed by an administrator and
          may be automatically placed in a spam queue when they contain links or
          restricted terms associated with abuse.
        </p>

        <h3>Donations</h3>
        <p>
          Stripe processes donations on a Stripe-hosted checkout page. We store
          the amount, currency, payment status, Stripe checkout and payment
          identifiers, transaction timestamps, and the donor email returned
          after payment. We do not receive or store your full payment-card
          number or card security code.
        </p>

        <h3>Location, map, weather, and forecast use</h3>
        <p>
          If you select a nearby-location feature, your browser asks for
          permission to use its location. The coordinates are used to centre the
          map or sort nearby campgrounds; they may be included in the website
          request URL and routine server logs, but we do not create a movement
          history. A home city is stored only when you deliberately add it to
          your profile.
        </p>
        <p>
          Map styles and tiles are loaded from Protomaps, so Protomaps receives
          ordinary web-request information such as your IP address and browser
          details. MoziWatch sends location-search text or campground
          coordinates—not your account identity—to Open-Meteo when requesting
          weather, historical weather, geocoding, or forecast data. Weather
          responses are cached to reduce repeat requests.
        </p>

        <h3>Technical and usage information</h3>
        <p>
          Our hosting systems may process IP address, browser and device type,
          requested URL, referring page, timestamps, and error or security logs.
          For report and contact-form duplicate prevention, the network address
          is normalized and converted into a keyed, one-way value before being
          stored in the application record. Raw network addresses may still be
          processed or retained temporarily in authentication, hosting, proxy,
          and security logs.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <p>We use information to:</p>
        <ul>
          <li>operate, secure, troubleshoot, and improve the Service;</li>
          <li>create and protect accounts and deliver account emails;</li>
          <li>
            publish and aggregate campground reports while keeping account
            identity separate from the public report;
          </li>
          <li>
            prevent duplicates, rate-limit submissions, detect spam, moderate
            content, and enforce our Terms;
          </li>
          <li>
            calculate observed ratings and use eligible reports as one evidence
            stream in versioned mosquito forecasts;
          </li>
          <li>save campground preferences and nearby-location settings;</li>
          <li>respond to contact messages and campground corrections;</li>
          <li>process and reconcile donations; and</li>
          <li>
            measure website use and comply with legal, accounting, and security
            obligations.
          </li>
        </ul>
        <p>
          User reports adjust the rule-based forecast as report evidence. They
          are not represented as mosquito trap observations, disease
          surveillance, or a machine-learning training set. We may use
          de-identified or aggregated information to improve campground data,
          reports, and forecast methods.
        </p>
      </section>

      <section>
        <h2>Cookies, tags, and similar technology</h2>
        <p>
          Essential first-party cookies keep you signed in, protect account
          actions, and support anonymous duplicate prevention. Blocking them may
          prevent account or reporting features from working.
        </p>
        <p>
          We use Google Tag Manager to manage approved measurement tags. Tag
          Manager and any tags configured within it may process page URLs,
          referrers, interactions, cookie identifiers, IP-derived location, and
          browser or device information according to their configuration and the
          provider’s terms. Browser settings and installed privacy tools can be
          used to limit or delete non-essential cookies. A third party may also
          set or read its own technology after you follow an external link, such
          as an Amazon product link or Stripe checkout link.
        </p>
      </section>

      <section>
        <h2>Spam and abuse protection</h2>
        <p>
          Report, contact, and campground-suggestion forms use Google reCAPTCHA
          Enterprise. Google receives the generated action token and technical
          request information, including IP address, browser user-agent,
          expected action, and site hostname, to return an abuse-risk
          assessment. reCAPTCHA Enterprise is used for security and spam
          prevention, not to decide credit, employment, insurance, or similar
          eligibility. Its use is governed by the{" "}
          <a href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>{" "}
          and <a href="https://policies.google.com/terms">Terms of Service</a>.
        </p>
      </section>

      <section>
        <h2>Service providers and disclosures</h2>
        <p>
          We disclose information only as reasonably necessary to operate the
          Service, follow your instructions, protect the website and its users,
          or comply with law. Current categories and providers include:
        </p>
        <ul>
          <li>
            <strong>Database:</strong> Supabase hosts the managed PostgreSQL and
            PostGIS database that contains account, report, submission,
            donation, campground, weather, and forecast records.
          </li>
          <li>
            <strong>Hosting:</strong> our web host and server infrastructure
            process page requests, application traffic, and security logs.
          </li>
          <li>
            <strong>Authentication:</strong> Google and Meta process social
            sign-in when you choose their services. Email/password accounts are
            managed by MoziWatch using the Better Auth software library.
          </li>
          <li>
            <strong>Email:</strong> Brevo receives recipient email addresses and
            message content to deliver verification, password-reset,
            email-change, and contact-notification emails.
          </li>
          <li>
            <strong>Payments:</strong> Stripe receives payment, contact, device,
            and transaction information to host checkout, process donations,
            prevent fraud, and handle payment records.
          </li>
          <li>
            <strong>Security and measurement:</strong> Google provides reCAPTCHA
            Enterprise and Tag Manager. Other measurement providers receive
            information only when their tags are enabled in Tag Manager.
          </li>
          <li>
            <strong>Maps, weather, and geocoding:</strong> Protomaps provides
            hosted basemap resources, and Open-Meteo provides weather,
            historical weather, elevation, and place-search data.
          </li>
          <li>
            <strong>External products:</strong> Amazon receives information
            under its own policies when you follow an affiliate link or use its
            services. MoziWatch does not receive your Amazon order details.
          </li>
        </ul>
        <p>
          We may also disclose information to professional advisers, a successor
          in a business transfer, or public authorities when reasonably required
          by law, to establish or defend legal rights, or to protect people and
          the Service. MoziWatch does not sell personal information for money.
        </p>
      </section>

      <section>
        <h2>Legal reasons for processing</h2>
        <p>
          Where privacy law requires a legal basis, we rely on the steps needed
          to provide the Service you request, your consent, our legitimate
          interests in operating and securing MoziWatch, and our legal or
          accounting obligations. You may withdraw consent where it is the basis
          for processing, but that does not affect earlier lawful processing.
        </p>
      </section>

      <section>
        <h2>Retention and account deletion</h2>
        <p>
          We keep personal information only as long as reasonably needed for the
          purposes described here, including security, moderation, accounting,
          dispute, backup, and legal requirements. Retention depends on the type
          of record:
        </p>
        <ul>
          <li>
            Account and profile information is generally kept while the account
            is active. Verification records expire, and sessions are removed on
            account deletion or according to authentication expiry rules.
          </li>
          <li>
            Published reports may remain as de-identified campground history.
            When you delete your account, the account, sessions, and saved
            campgrounds are removed and reports are permanently disconnected
            from the account.
          </li>
          <li>
            Contact messages, corrections, spam records, keyed abuse
            identifiers, and moderation or administrative audit records are
            retained as needed to resolve the submission, prevent abuse, and
            preserve accountability.
          </li>
          <li>
            Donation records are retained as needed for reconciliation,
            accounting, fraud prevention, disputes, and legal obligations.
          </li>
          <li>
            Routine provider, server, and backup copies may remain for a limited
            period after active records are deleted.
          </li>
        </ul>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          We use measures designed to protect information, including encrypted
          connections, restricted administrative access, secure cookies,
          password hashing, OAuth-token encryption, one-way abuse identifiers,
          database access controls, and backups. No internet service can
          guarantee absolute security. Please use a unique password and contact
          us if you believe your account has been compromised.
        </p>
      </section>

      <section>
        <h2>International processing</h2>
        <p>
          MoziWatch is operated from British Columbia, Canada. Providers may
          process or store information in Canada, the United States, Europe, or
          other countries where they operate. Those countries may have privacy
          laws that differ from the laws where you live. We remain responsible
          for our handling of personal information as required by applicable
          law.
        </p>
      </section>

      <section>
        <h2>Your choices and privacy rights</h2>
        <p>
          Your profile lets you update your name, home city, email, and
          password, and lets you delete your account. Depending on applicable
          law, you may also ask to access, correct, or delete personal
          information, or object to or restrict certain processing. We may need
          to verify your identity and may retain information when law or a
          permitted operational reason requires it.
        </p>
        <p>
          Submit a privacy question or request through the{" "}
          <Link href="/contact">Contact Us form</Link>. Email addresses
          submitted to MoziWatch are not intentionally published on the website.
          If a privacy concern cannot be resolved with us, you may have the
          right to contact the privacy regulator where you live.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>
          The Service is not directed to children under 13, and we do not
          knowingly collect personal information from a child under 13. If you
          believe a child has provided personal information, contact us so we
          can review and delete it where appropriate.
        </p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as the Service, providers, or legal
          requirements change. The updated version will be posted here with a
          revised effective date. We will provide an additional notice when a
          material change requires one.
        </p>
      </section>
    </div>
  );
}
