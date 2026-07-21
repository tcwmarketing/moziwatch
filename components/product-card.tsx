import type { Product } from "@/config/products";
import Image from "next/image";

export function ProductCard({ product }: { product: Product }) {
  return (
    <a
      className="product-card"
      href={product.url}
      target="_blank"
      rel="nofollow sponsored noreferrer"
    >
      <span className="product-image">
        <Image
          src={`/product-images/${product.id}.${product.image.endsWith(".png") ? "png" : "jpg"}?v=20260719-final`}
          alt={product.name}
          fill
          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 25vw"
        />
      </span>
      <span className="product-copy">
        <span
          className="product-rating"
          aria-label={`${product.rating} out of 5 stars on Amazon`}
        >
          <span aria-hidden="true">★</span> {product.rating.toFixed(1)} / 5
        </span>
        <strong>{product.name}</strong>
        <span>{product.description}</span>
        <small>{product.detail}</small>
      </span>
      <span className="button secondary">Purchase on Amazon</span>
    </a>
  );
}
