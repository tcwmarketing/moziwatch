import { sqlClient } from "./index";
import { normalizeName } from "../worker/locations/types";

const developmentCampgrounds = [
  [
    "Cedar Loop Camp",
    "cedar-loop-camp",
    "1 Demo Trail",
    "Squamish",
    "British Columbia",
    "CA",
    "V0N 1T0",
    49.75,
    -123.14,
  ],
  [
    "Prairie Sky Camp",
    "prairie-sky-camp",
    "25 Example Road",
    "Saskatoon",
    "Saskatchewan",
    "CA",
    "S7K 3J8",
    52.18,
    -106.62,
  ],
  [
    "Shield Lake Camp",
    "shield-lake-camp",
    "9 Sample Lane",
    "Kenora",
    "Ontario",
    "CA",
    "P9N 3X2",
    49.77,
    -94.49,
  ],
  [
    "Pine Hollow Camp",
    "pine-hollow-camp",
    "44 Demo Route",
    "Burlington",
    "Vermont",
    "US",
    "05401",
    44.48,
    -73.12,
  ],
  [
    "Red Rock Camp",
    "red-rock-camp",
    "18 Example Drive",
    "Moab",
    "Utah",
    "US",
    "84532",
    38.58,
    -109.55,
  ],
  [
    "Rainshadow Camp",
    "rainshadow-camp",
    "7 Sample Way",
    "Port Angeles",
    "Washington",
    "US",
    "98362",
    48.1,
    -123.43,
  ],
] as const;

for (const campground of developmentCampgrounds) {
  await sqlClient`
    INSERT INTO campgrounds (name, normalized_name, slug, address, city, region, country, postal_code, latitude, longitude, data_source)
    VALUES (${campground[0]}, ${normalizeName(campground[0])}, ${campground[1]}, ${campground[2]}, ${campground[3]}, ${campground[4]}, ${campground[5]}, ${campground[6]}, ${campground[7]}, ${campground[8]},
            'fictional-development-seed')
    ON CONFLICT (slug) DO NOTHING
  `;
}

if (process.env.SEED_ADMIN_EMAIL) {
  await sqlClient`UPDATE "user" SET role = 'admin' WHERE lower(email) = lower(${process.env.SEED_ADMIN_EMAIL})`;
}

await sqlClient.end();
console.log(
  `Seeded ${developmentCampgrounds.length} fictional development campgrounds.`,
);
