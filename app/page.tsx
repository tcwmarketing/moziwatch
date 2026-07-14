import { MapExperience } from "@/components/map-experience";
import { publicEnv } from "@/lib/env";

export default function Home() {
  return (
    <>
      <section className="home-intro">
        <div>
          <p className="eyebrow">Campground conditions, shared by campers</p>
          <h1>Know before the mosquitoes do.</h1>
        </div>
        <p>
          Explore actual campground reports alongside an independently
          controlled experimental forecast. They are never blended.
        </p>
      </section>
      <MapExperience
        mapConfig={{
          mode: publicEnv.basemapMode,
          styleUrl: publicEnv.protomapsStyleUrl,
          apiKey: publicEnv.protomapsApiKey,
          pmtilesUrl: publicEnv.protomapsPmtilesUrl,
        }}
      />
      <section className="trust-strip" aria-label="How the data works">
        <article>
          <span>01</span>
          <div>
            <h2>Camper reports</h2>
            <p>
              Marker colors use only valid, published reports submitted by
              people at campgrounds.
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h2>Statistical forecast</h2>
            <p>
              The optional heat layer estimates risk from weather and
              environmental predictors. It is not a direct observation.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h2>Privacy by design</h2>
            <p>
              Anonymous reporting uses protected identifiers for duplicate
              prevention. Raw IP addresses are not kept.
            </p>
          </div>
        </article>
      </section>
    </>
  );
}
