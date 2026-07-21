import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { products } from "@/config/products";

const outputDirectory = resolve("public/product-images");
await mkdir(outputDirectory, { recursive: true });

for (const product of products) {
  const response = await fetch(product.image, {
    headers: { "user-agent": "MoziWatch product-image synchronization" },
  });
  if (!response.ok)
    throw new Error(
      `Image download failed for ${product.id}: ${response.status}`,
    );
  const extension = product.image.endsWith(".png") ? "png" : "jpg";
  await writeFile(
    resolve(outputDirectory, `${product.id}.${extension}`),
    Buffer.from(await response.arrayBuffer()),
  );
  console.log(`Updated ${product.id}.${extension}`);
}
