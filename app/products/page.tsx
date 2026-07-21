import type { Metadata } from "next";
import { ProductCard } from "@/components/product-card";
import { productCategories, products } from "@/config/products";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Mosquito protection products",
  description:
    "Highly rated mosquito repellents, nets, treated gear, shelters and bite-relief products selected for campers.",
  alternates: { canonical: absoluteUrl("/products") },
};

export default function ProductsPage() {
  const availableProductCategories = productCategories.filter((category) =>
    products.some((product) => product.category === category),
  );

  return (
    <div className="content-page products-page">
      <header className="products-intro">
        <p className="eyebrow">
          Hand picked, highly rated products proven to be effective
        </p>
        <h1>Mosquito protection products</h1>
        <p>
          Browse a practical selection of {products.length} repellents, treated
          gear, mosquito nets, screened shelters and bite-relief products. Use
          the severity guide to choose the amount of protection that fits the
          conditions at your campground.
        </p>
        <p className="products-safety-note">
          Always read the product label, age restrictions and directions before
          use.
        </p>
      </header>
      <section className="protection-guide content-card">
        <h2>What to consider by severity</h2>
        <dl>
          <div>
            <dt>None/minimal</dt>
            <dd>No special equipment recommendation.</dd>
          </div>
          <div>
            <dt>Light</dt>
            <dd>Small picaridin/icaridin or DEET spray or wipes.</dd>
          </div>
          <div>
            <dt>Moderate</dt>
            <dd>Repellent plus an optional head net or protective clothing.</dd>
          </div>
          <div>
            <dt>Heavy</dt>
            <dd>Head net, bug clothing, repellent and a screened shelter.</dd>
          </div>
          <div>
            <dt>Severe</dt>
            <dd>
              Full physical protection: bug clothing, head net, screened shelter
              and repellent.
            </dd>
          </div>
        </dl>
        <nav className="product-jump-menu" aria-label="Product categories">
          {availableProductCategories.map((category) => (
            <a
              key={category}
              href={`#${category.toLowerCase().replaceAll(" ", "-")}`}
            >
              {category}
            </a>
          ))}
        </nav>
      </section>
      {availableProductCategories.map((category) => {
        const categoryProducts = products.filter(
          (product) => product.category === category,
        );
        return (
          <section
            className="product-category"
            id={category.toLowerCase().replaceAll(" ", "-")}
            key={category}
          >
            <div className="product-category-heading">
              <h2>{category}</h2>
              <span>
                {categoryProducts.length}{" "}
                {categoryProducts.length === 1 ? "product" : "products"}
              </span>
            </div>
            <div className="product-grid">
              {categoryProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        );
      })}
      <p className="products-review-note">
        Amazon ratings were reviewed July 19, 2026 and may change.
      </p>
    </div>
  );
}
