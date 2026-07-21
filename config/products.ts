export type ProductCategory =
  | "DEET repellents"
  | "Picaridin repellents"
  | "DEET-free alternatives"
  | "Gear Treatment"
  | "Wearable protection"
  | "Nets and sleep protection"
  | "Screen shelters"
  | "Area devices"
  | "Bite relief";

export type ProtectionLevel =
  "light" | "moderate" | "heavy" | "severe" | "mixed";

export type Product = {
  id: string;
  asin: string;
  rating: number;
  category: ProductCategory;
  name: string;
  description: string;
  detail: string;
  url: string;
  image: string;
  protection: ProtectionLevel[];
};

// Finalized from amazon-product-link-audit2.xlsx on 2026-07-19.
// The Amazon short links remain the public affiliate destinations. The direct
// media URLs are used only by the server-side image synchronization command.
export const products: Product[] = [
  {
    id: "repel-100",
    asin: "B004H89KFC",
    rating: 4.6,
    category: "DEET repellents",
    name: "Repel 100 DEET Spray",
    description:
      "High-strength, long-lasting personal repellent for demanding outdoor conditions.",
    detail: "4 oz · up to 10 hours",
    url: "https://amzn.to/3T8bmGz",
    image: "https://m.media-amazon.com/images/I/61LXfxfWwyL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "off-deep-woods",
    asin: "B019ZTXU2G",
    rating: 4.6,
    category: "DEET repellents",
    name: "OFF! Deep Woods Aerosol",
    description:
      "Dry, non-greasy mosquito and tick repellent for camping and outdoor use.",
    detail: "Two 4 oz cans",
    url: "https://amzn.to/4vzEBPW",
    image: "https://m.media-amazon.com/images/I/718Q5uTUwbL._AC_SL1500_.jpg",
    protection: ["light", "moderate", "heavy"],
  },
  {
    id: "off-active",
    asin: "B003AOA3UA",
    rating: 4.7,
    category: "DEET repellents",
    name: "OFF! Active Repellent",
    description:
      "Sweat-resistant mosquito and tick repellent for active outdoor use.",
    detail: "Twelve 6 oz cans",
    url: "https://amzn.to/4poPWAU",
    image: "https://m.media-amazon.com/images/I/81m-nmi-8YL._AC_SL1500_.jpg",
    protection: ["moderate", "heavy"],
  },
  {
    id: "sawyer-picaridin",
    asin: "B07BSN5YLN",
    rating: 4.4,
    category: "Picaridin repellents",
    name: "Sawyer Picaridin Repellent",
    description:
      "Fragrance-free personal repellent and a practical alternative to DEET.",
    detail: "Two 4 oz bottles",
    url: "https://amzn.to/4gFRWm7",
    image: "https://m.media-amazon.com/images/I/714vseC3iXL._AC_SL1500_.jpg",
    protection: ["light", "moderate", "mixed"],
  },
  {
    id: "off-clean-feel",
    asin: "B0DP5DZ57B",
    rating: 4.6,
    category: "Picaridin repellents",
    name: "OFF! Clean Feel Picaridin",
    description:
      "Fragrance-free aerosol protection against mosquitoes, ticks and flies.",
    detail: "Two 5 oz cans · 20% picaridin",
    url: "https://amzn.to/4f9e5rL",
    image: "https://m.media-amazon.com/images/I/71KOOjJp3QL._AC_SL1500_.jpg",
    protection: ["light", "moderate", "heavy"],
  },
  {
    id: "avon-picaridin",
    asin: "B00KJS6BQA",
    rating: 4.6,
    category: "Picaridin repellents",
    name: "Avon Skin So Soft Picaridin",
    description:
      "Non-greasy, DEET-free family repellent with vitamin E and aloe.",
    detail: "4 fl oz pump spray",
    url: "https://amzn.to/4b1ryPY",
    image: "https://m.media-amazon.com/images/I/71WId46DUTL._AC_SL1500_.jpg",
    protection: ["light", "moderate"],
  },
  {
    id: "boogie-lotion",
    asin: "B0BTR2DTWM",
    rating: 4.7,
    category: "Picaridin repellents",
    name: "Boogie Insect Repellent Lotion",
    description:
      "Fragrance-free lotion formulated as a long-wearing DEET alternative.",
    detail: "6 fl oz · up to 14 hours",
    url: "https://amzn.to/4fdvP3S",
    image: "https://m.media-amazon.com/images/I/71QwYHDNNkL._AC_SL1500_.jpg",
    protection: ["light", "moderate", "mixed"],
  },
  {
    id: "ms-pixies",
    asin: "B0F2MDGFLW",
    rating: 4.8,
    category: "DEET-free alternatives",
    name: "Ms. Pixie's Kids Repellent",
    description:
      "Plant-based, DEET-free mosquito repellent marketed for babies and toddlers.",
    detail: "3 oz · check age directions",
    url: "https://amzn.to/4fv9HT4",
    image: "https://m.media-amazon.com/images/I/618AOPn1UXL._AC_SL1500_.jpg",
    protection: ["light", "mixed"],
  },
  {
    id: "sawyer-permethrin",
    asin: "B07CD9NFB4",
    rating: 4.6,
    category: "Gear Treatment",
    name: "Sawyer Permethrin Clothing Treatment",
    description:
      "Long-lasting insect-repellent treatment for clothing, camping gear and tents.",
    detail: "Two 24 oz trigger bottles · not for skin",
    url: "https://amzn.to/4hlo92j",
    image: "https://m.media-amazon.com/images/I/81drsTLaouL._AC_SL1500_.jpg",
    protection: ["moderate", "heavy", "severe"],
  },
  {
    id: "bug-x-wipes",
    asin: "B0051OJ9DO",
    rating: 4.7,
    category: "DEET repellents",
    name: "Bug X DEET Wipes",
    description:
      "Individually packed wipes that are convenient for hikes and day trips.",
    detail: "25 wipes · 30% DEET",
    url: "https://amzn.to/4h3iwG7",
    image: "https://m.media-amazon.com/images/I/61l0CaGkYoL._AC_SL1500_.jpg",
    protection: ["light", "moderate", "mixed"],
  },
  {
    id: "head-net-hat",
    asin: "B06XK6XXV3",
    rating: 4.5,
    category: "Wearable protection",
    name: "Flammi Head Net Hat",
    description:
      "Sun hat with integrated face mesh for hands-free protection outdoors.",
    detail: "UPF 50+ · dark grey",
    url: "https://amzn.to/4hk8hgu",
    image: "https://m.media-amazon.com/images/I/71FzEt1xYSL._AC_SL1500_.jpg",
    protection: ["moderate", "heavy", "severe"],
  },
  {
    id: "hestya-head-nets",
    asin: "B07DKZ1BVV",
    rating: 4.7,
    category: "Wearable protection",
    name: "HESTYA Mosquito Head Nets",
    description: "Simple mesh nets designed to fit over a brimmed hat.",
    detail: "6-pack · hat not included",
    url: "https://amzn.to/4b0Fk5v",
    image: "https://m.media-amazon.com/images/I/71UQ412MZFL._AC_SL1500_.jpg",
    protection: ["moderate", "heavy", "severe"],
  },
  {
    id: "loogu-mosquito-suit",
    asin: "B0FM6SLRZ8",
    rating: 4.5,
    category: "Wearable protection",
    name: "LOOGU Mosquito Suit",
    description:
      "Ultra-fine mesh jacket, hood and pants set for outdoor mosquito protection.",
    detail: "Three-piece mesh set · check size chart",
    url: "https://amzn.to/4pzhCDu",
    image: "https://m.media-amazon.com/images/I/71a1BylGxrL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "tough-outfitters-mosquito-suit",
    asin: "B07MBPHZZ1",
    rating: 4.4,
    category: "Wearable protection",
    name: "Tough Outfitters Mosquito Suit",
    description:
      "Bug-proof mesh clothing set for gardening, camping and other outdoor activities.",
    detail: "Jacket, hood and pants · check size chart",
    url: "https://amzn.to/4pN79o5",
    image: "https://m.media-amazon.com/images/I/615GMFGi2gL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "coghlans-net",
    asin: "B000ECUFI6",
    rating: 4.5,
    category: "Nets and sleep protection",
    name: "Coghlan's Double Mosquito Net",
    description:
      "Rectangular sleeping net sized for two sleeping bags or camping cots.",
    detail: "63 × 78 × 59 in · setup kit",
    url: "https://amzn.to/4bJkU0T",
    image: "https://m.media-amazon.com/images/I/516vB9j3uVL._SL1024_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "baby-stroller-net",
    asin: "B07TK5CWYW",
    rating: 4.6,
    category: "Nets and sleep protection",
    name: "Baby Stroller Mosquito Net",
    description:
      "Fine mesh cover for compatible strollers, carriers and bassinets.",
    detail: "Elastic drawstring · 1000 mesh",
    url: "https://amzn.to/4bkcoWj",
    image: "https://m.media-amazon.com/images/I/81bE3ZDJurS._AC_SL1500_.jpg",
    protection: ["moderate", "heavy", "mixed"],
  },
  {
    id: "stroller-net-two-pack",
    asin: "B093KZ2J1K",
    rating: 4.6,
    category: "Nets and sleep protection",
    name: "Baby Stroller Nets",
    description:
      "Breathable universal-fit mesh protection for bassinets and playards.",
    detail: "2-pack · elastic fit",
    url: "https://amzn.to/4wTzCec",
    image: "https://m.media-amazon.com/images/I/81PxPK70gHL._SL1500_.jpg",
    protection: ["moderate", "heavy"],
  },
  {
    id: "net-hammock",
    asin: "B0GL18H87K",
    rating: 4.5,
    category: "Nets and sleep protection",
    name: "Camping Hammock with Bug Net",
    description:
      "Portable hammock with integrated mosquito mesh and tree straps.",
    detail: "500 lb capacity · 2-in-1 design",
    url: "https://amzn.to/4wfD1E4",
    image: "https://m.media-amazon.com/images/I/71bK7NbW4XL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "wise-owl-hammock-net",
    asin: "B073GNV5SX",
    rating: 4.7,
    category: "Nets and sleep protection",
    name: "Wise Owl Hammock Bug Net",
    description:
      "Lightweight mesh enclosure designed to surround a camping hammock.",
    detail: "Portable · hammock not included",
    url: "https://amzn.to/4wTbZlW",
    image: "https://m.media-amazon.com/images/I/81o7RAINCZL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "night-cat-tent",
    asin: "B0CSKDNBMP",
    rating: 4.5,
    category: "Nets and sleep protection",
    name: "Night Cat Mosquito Tent",
    description:
      "One-person pop-up screened sleep shelter sized to fit over a camping cot.",
    detail: "Pop-up design · cot not included",
    url: "https://amzn.to/3Rg1nhS",
    image: "https://m.media-amazon.com/images/I/61NMqbFndML._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "alvantor-screen-house",
    asin: "B07TXBB49X",
    rating: 4.5,
    category: "Screen shelters",
    name: "Alvantor 10 × 10 Screen House",
    description:
      "Pop-up mesh shelter for a more comfortable campsite sitting area.",
    detail: "10 × 10 ft · not waterproof",
    url: "https://amzn.to/3TGdLZ6",
    image: "https://m.media-amazon.com/images/I/81OyGWT0QzL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "coleman-canopy",
    asin: "B07DKFTQQT",
    rating: 4.5,
    category: "Screen shelters",
    name: "CORE Instant Screen House",
    description:
      "Large portable screen shelter for family campsites and outdoor meals.",
    detail: "12 × 10 ft · carry bag included",
    url: "https://amzn.to/4bQBvQu",
    image: "https://m.media-amazon.com/images/I/51UUmh2sGFL._AC_SL1000_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "alvantor-small-screen",
    asin: "B0F8VLS7HB",
    rating: 4.5,
    category: "Screen shelters",
    name: "Alvantor Compact Screen Room",
    description: "Compact pop-up screened shelter for two to four people.",
    detail: "7 × 4 × 7 ft · carry bag included",
    url: "https://amzn.to/3RDN2Me",
    image: "https://m.media-amazon.com/images/I/81pcDRD8olL._AC_SL1500_.jpg",
    protection: ["heavy", "severe"],
  },
  {
    id: "aspectek-zapper",
    asin: "B01LWLFB5U",
    rating: 4.5,
    category: "Area devices",
    name: "ASPECTEK Electric Bug Zapper",
    description:
      "Mains-powered flying-insect device for indoor or covered outdoor areas.",
    detail: "20 W · two replacement bulbs",
    url: "https://amzn.to/3QZU25Z",
    image: "https://m.media-amazon.com/images/I/71FISsJnd-L._AC_SL1500_.jpg",
    protection: ["mixed"],
  },
  {
    id: "indoor-fly-trap",
    asin: "B0GZTN9882",
    rating: 4.6,
    category: "Area devices",
    name: "Indoor UV Fly Trap",
    description:
      "Plug-in UV and suction trap intended for fruit flies and gnats indoors.",
    detail: "6/12-hour timer · 10 refills",
    url: "https://amzn.to/4vxKxJr",
    image: "https://m.media-amazon.com/images/I/71qu5kRANKL._AC_SL1500_.jpg",
    protection: ["mixed"],
  },
  {
    id: "after-bite",
    asin: "B07PJ5TNPP",
    rating: 4.6,
    category: "Bite relief",
    name: "After Bite Advanced",
    description:
      "Portable topical itch relief for mosquito and other insect bites.",
    detail: "Four 0.5 oz applicators",
    url: "https://amzn.to/4wJXJM3",
    image: "https://m.media-amazon.com/images/I/510EbT-aaRL._AC_SL1000_.jpg",
    protection: ["moderate", "heavy", "severe", "mixed"],
  },
  {
    id: "cutter-bitemd",
    asin: "B001CUX6N0",
    rating: 4.4,
    category: "Bite relief",
    name: "Cutter BiteMD Relief Stick",
    description:
      "Portable analgesic and antiseptic treatment for insect bites.",
    detail: "0.5 fl oz · external use",
    url: "https://amzn.to/3RhFGho",
    image: "https://m.media-amazon.com/images/I/71qIXc40rFL._AC_SL1500_.jpg",
    protection: ["moderate", "heavy", "severe"],
  },
];

const fallbackIds = [
  "off-clean-feel",
  "hestya-head-nets",
  "alvantor-small-screen",
];

export function recommendedProducts(input: {
  forecastLevel?: string | null;
  recentAverage?: number | null;
}) {
  const text = input.forecastLevel?.toLowerCase() || "";
  let severity: ProtectionLevel | null = null;
  if (/severe|level 5/.test(text)) severity = "severe";
  else if (/heavy|level 4/.test(text)) severity = "heavy";
  else if (/moderate|level 3/.test(text)) severity = "moderate";
  else if (/light|level 2|minimal|none|level 1/.test(text)) severity = "light";
  else if (input.recentAverage != null) {
    severity =
      input.recentAverage >= 4.5
        ? "severe"
        : input.recentAverage >= 3.5
          ? "heavy"
          : input.recentAverage >= 2.5
            ? "moderate"
            : "light";
  }

  if (!severity) {
    return fallbackIds
      .map((id) => products.find((product) => product.id === id))
      .filter((product): product is Product => Boolean(product));
  }

  return products
    .filter((product) => product.protection.includes(severity))
    .slice(0, 3);
}

export const productCategories: ProductCategory[] = [
  "DEET repellents",
  "Picaridin repellents",
  "DEET-free alternatives",
  "Gear Treatment",
  "Wearable protection",
  "Nets and sleep protection",
  "Screen shelters",
  "Area devices",
  "Bite relief",
];
