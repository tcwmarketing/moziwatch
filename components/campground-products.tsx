import Link from "next/link";
import { recommendedProducts } from "@/config/products";
import { ProductCard } from "@/components/product-card";

export function CampgroundProducts({
  forecastLevel,
  recentAverage,
}: {
  forecastLevel?: string | null;
  recentAverage?: number | null;
}) {
  const recommendations = recommendedProducts({ forecastLevel, recentAverage });
  return (
    <section className="content-card campground-products">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Pack for the conditions</p>
          <h2>Suggested mosquito gear</h2>
        </div>
        <Link href="/products">View all products</Link>
      </div>
      <div className="product-grid product-grid-three">
        {recommendations.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}
