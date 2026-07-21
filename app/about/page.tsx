import Link from "next/link";
import type { Metadata } from "next";
import { LocationSuggestionForm } from "@/components/location-suggestion-form";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "How MoziWatch works",
  description:
    "Learn how MoziWatch keeps recent campground mosquito reports separate from approximate weather and habitat outlooks.",
  alternates: { canonical: absoluteUrl("/about") },
};

export default function AboutPage() {
  return (
    <div className="content-page prose-page">
      <p className="eyebrow">How it works</p>
      <h1>Two signals. One clear map.</h1>
      <section>
        <h2>Camper reports</h2>
        <p>
          Campground marker colors come only from valid, published reports
          submitted by campers. A gray marker means there are no recent
          published reports for that campground.
        </p>
      </section>
      <section>
        <h2>Experimental forecast</h2>
        <p>
          Available campground outlooks combine habitat, recent weather history
          and expected evening conditions. Eligible recent and seasonal camper
          reports can adjust an outlook when there is enough consistent
          evidence, but observed ratings remain separate. Monthly outlooks offer
          broader planning guidance rather than a prediction for a specific
          date.
        </p>
      </section>
      <section>
        <h2>Report responsibly</h2>
        <p>
          Share what you observed at the campground. Reports use five
          plain-language choices from None through Severe. A 24-hour duplicate
          window protects each campground while still allowing reports at
          different campgrounds.
        </p>
      </section>
      <section>
        <h2>Missing campground or correction</h2>
        <p>
          Suggest an established campground that is missing from the map. Every
          suggestion is moderated before it can affect the canonical location
          data.
        </p>
        <LocationSuggestionForm />
      </section>
      <Link className="button primary" href="/">
        Explore the map
      </Link>
    </div>
  );
}
