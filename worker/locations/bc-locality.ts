const GENERIC_LOCALITIES = new Set(["", "bc", "british columbia", "unknown"]);

const NAMED_AREAS: Array<[string, RegExp]> = [
  ["Haida Gwaii", /\bHaida Gwaii\b/i],
  [
    "Vancouver Island",
    /\b(?:on|of|central|northern|southern) Vancouver Island\b/i,
  ],
  ["Gulf Islands", /\bGulf Islands?\b/i],
  ["Sunshine Coast", /\bSunshine Coast\b/i],
  ["Sea to Sky", /\bSea[- ]to[- ]Sky\b/i],
  ["Fraser Valley", /\bFraser Valley\b/i],
  ["Lower Mainland", /\bLower Mainland\b/i],
  ["Bulkley Valley", /\bBulkley Valley\b/i],
  ["Peace River", /\bPeace River (?:region|district|country|area)\b/i],
  ["North Coast", /\bNorth Coast (?:region|district|area)\b/i],
  [
    "Okanagan",
    /\b(?:(?:North|South|Central) Okanagan|Okanagan (?:Valley|Basin|Plateau|region|area|country))\b/i,
  ],
  [
    "Kootenay",
    /\b(?:(?:East|West) Kootenay|Kootenay (?:Rockies|region|area|valley|lake|district))\b/i,
  ],
  ["Shuswap", /\bShuswap (?:Lake|region|area|country)\b/i],
  ["Cariboo", /\bCariboo (?:region|district|area|country)\b/i],
  ["Chilcotin", /\bChilcotin (?:region|district|area|country|Plateau)\b/i],
  ["Thompson", /\bThompson (?:region|district|area|country|Plateau)\b/i],
  ["Skeena", /\bSkeena (?:region|district|area|valley)\b/i],
  ["Omineca", /\bOmineca (?:region|district|area|Mountains)\b/i],
];

function plainText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPlace(value: string) {
  return value
    .replace(/\bSt\.\s+/g, "St§")
    .split(/[.;]/)[0]
    .replace(/St§/g, "St. ")
    .replace(
      /^(?:the\s+)?(?:cities|towns|villages|communities|city|town|village|community)\s+of\s+/i,
      "",
    )
    .replace(/[’']s\s+(?:Hwy|Highway|Road|Route)\b.*$/i, "")
    .replace(/\s+(?:located|which|approximately|about)\b.*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/\s+community$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstPlace(value: string) {
  return cleanPlace(value.split(/,|\s+and\s+|\s+or\s+/i)[0] || "");
}

function isUsableCommunity(candidate: string, protectedAreaName: string) {
  if (!candidate || /^(?:hwy|highway|road|route)$/i.test(candidate))
    return false;
  const normalized = (value: string) =>
    value
      .toLowerCase()
      .replace(/\b(?:provincial|marine|national|recreation|protected)\b/g, "")
      .replace(/\b(?:park|area|site)\b/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return normalized(candidate) !== normalized(protectedAreaName);
}

function nearbyCommunity(notes: string, protectedAreaName: string) {
  const searchable = notes.replace(/\bSt\.\s+/g, "St§");
  const closest = searchable.match(
    /\b(?:closest|nearest)\s+(?:community|communities|towns?|city|cities)(?:\s*,\s*(?:community|communities|towns?|city|cities))*(?:\s*,?\s*and\s+(?:community|communities|towns?|city|cities))?\s+(?:are|is)\s+([^.;]+)/i,
  );
  if (closest?.[1]) {
    const candidate = firstPlace(closest[1]);
    if (isUsableCommunity(candidate, protectedAreaName)) return candidate;
  }

  const distance = searchable.match(
    /\b\d+(?:\.\d+)?\s*(?:km|kilometres?|miles?)\s+(?:north|south|east|west|northeast|northwest|southeast|southwest)\s+of\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-§]*(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-§]*){0,3})/,
  );
  if (distance?.[1]) {
    const candidate = cleanPlace(distance[1]);
    if (isUsableCommunity(candidate, protectedAreaName)) return candidate;
  }

  const near = searchable.match(
    /\b(?:near|outside(?:\s+of)?)\s+([A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-§]*(?:\s+[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'’.-§]*){0,3})/,
  );
  const candidate = near?.[1] ? cleanPlace(near[1]) : "";
  return isUsableCommunity(candidate, protectedAreaName) ? candidate : null;
}

function namedArea(text: string) {
  return NAMED_AREAS.find(([, pattern]) => pattern.test(text))?.[0];
}

function isPlausibleNamedArea(
  area: string,
  latitude: number,
  longitude: number,
) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return true;
  if (area === "Kootenay") return longitude > -119 && latitude < 52.5;
  if (area === "Okanagan")
    return longitude > -121.5 && longitude < -118 && latitude < 52;
  if (area === "Vancouver Island" || area === "Gulf Islands")
    return longitude < -123 && latitude < 51.5;
  if (area === "Sunshine Coast")
    return longitude > -126 && longitude < -123 && latitude < 51.5;
  if (area === "Sea to Sky")
    return longitude > -124 && longitude < -121.5 && latitude < 51.5;
  if (area === "Lower Mainland" || area === "Fraser Valley")
    return longitude > -123.7 && latitude < 50.8;
  if (area === "Shuswap")
    return longitude > -121.5 && longitude < -118 && latitude < 52;
  if (area === "Haida Gwaii") return longitude < -131 && latitude < 55;
  return true;
}

function coordinateArea(latitude: number, longitude: number) {
  if (longitude < -131 && latitude >= 51.5 && latitude < 55)
    return "Haida Gwaii";
  if (latitude >= 54) return "Northern British Columbia";
  if (latitude >= 52 && longitude < -127) return "North Coast";
  if (latitude >= 52.5 && longitude < -120) return "Cariboo–Chilcotin";
  if (latitude < 51.3 && longitude < -123.5)
    return "Vancouver Island and Coast";
  if (latitude < 50.4 && longitude < -121) return "Lower Mainland";
  if (latitude < 51.8 && longitude > -118.5) return "Kootenay";
  if (latitude < 51.2 && longitude > -121) return "Okanagan–Boundary";
  if (latitude < 52.5 && longitude > -122.5) return "Thompson–Shuswap";
  return "Interior British Columbia";
}

export function isGenericBcLocality(value: string | null | undefined) {
  return GENERIC_LOCALITIES.has((value || "").trim().toLowerCase());
}

export function inferBcParksLocality(protectedArea: Record<string, unknown>) {
  const notes = plainText(protectedArea.locationNotes);
  const description = plainText(protectedArea.description);
  const protectedAreaName = plainText(protectedArea.protectedAreaName);
  const latitude = Number(protectedArea.latitude);
  const longitude = Number(protectedArea.longitude);
  const community = nearbyCommunity(notes, protectedAreaName);
  if (community) return community;

  const area = namedArea(`${protectedAreaName} ${notes} ${description}`);
  if (area && isPlausibleNamedArea(area, latitude, longitude)) return area;

  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? coordinateArea(latitude, longitude)
    : "British Columbia";
}
