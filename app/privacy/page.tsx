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
          sites. We store only a protected HMAC of that token.
        </p>
      </section>
      <section>
        <h2>IP addresses</h2>
        <p>
          Your network address is normalized on the server and immediately
          protected with a keyed HMAC. We do not store the raw address. The
          protected value is used for duplicate prevention and general abuse
          limits. Trusted proxy headers are used only when the operator
          configures an exact proxy count.
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
          The production operator must replace this paragraph with a monitored
          privacy contact and jurisdiction-specific retention schedule before
          launch.
        </p>
      </section>
    </div>
  );
}
