import fs from "node:fs";
import path from "node:path";

const [sourcePath, examplePath, destinationPath, deleteSourceFlag] =
  process.argv.slice(2);

if (!sourcePath || !examplePath || !destinationPath) {
  throw new Error(
    "Usage: node prepare-production-env.cjs <source> <example> <destination> [--delete-source]",
  );
}

if (
  deleteSourceFlag === "--delete-source" &&
  path.resolve(sourcePath) === path.resolve(destinationPath)
) {
  throw new Error(
    "Source and destination must differ when deleting the source.",
  );
}

const keyPattern = /^([A-Z][A-Z0-9_]*)=/;
const exampleLines = fs.readFileSync(examplePath, "utf8").split(/\r?\n/);
const orderedKeys = exampleLines
  .map((line) => line.match(keyPattern)?.[1])
  .filter(Boolean);
const excludedKeys = new Set([
  "TEST_DATABASE_URL",
  "TEST_DATABASE_DISPOSABLE",
  "SEED_ADMIN_EMAIL",
]);
const allowedKeys = new Set(
  orderedKeys.filter((key) => !excludedKeys.has(key)),
);
const values = new Map();

for (const line of fs.readFileSync(sourcePath, "utf8").split(/\r?\n/)) {
  const match = line.match(keyPattern);
  if (match && allowedKeys.has(match[1])) {
    values.set(match[1], line.slice(match[0].length));
  }
}

const productionOverrides = {
  NEXT_PUBLIC_APP_NAME: "MoziWatch",
  NEXT_PUBLIC_APP_URL: "https://moziwatch.com",
  BETTER_AUTH_URL: "https://moziwatch.com",
  TRUST_PROXY_HOPS: "1",
  OPEN_METEO_BASE_URL: "https://api.open-meteo.com/v1/forecast",
  STRIPE_MODE: "live",
  STRIPE_DONATION_CURRENCY: "cad",
  BOT_PROTECTION_PROVIDER: "recaptcha-enterprise",
  RECAPTCHA_MIN_SCORE: "0.3",
};

for (const [key, value] of Object.entries(productionOverrides)) {
  values.set(key, value);
}

const requiredKeys = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "IP_HASH_SECRET",
  "NEXT_PUBLIC_PROTOMAPS_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GOOGLE_API_KEY",
  "GOOGLE_CLOUD_PROJECT_ID",
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
];
const missingKeys = requiredKeys.filter((key) => !values.get(key));

if (missingKeys.length > 0) {
  throw new Error(
    `Missing required production variables: ${missingKeys.join(", ")}`,
  );
}

const uniqueKeys = orderedKeys.filter(
  (key, index) =>
    allowedKeys.has(key) &&
    orderedKeys.indexOf(key) === index &&
    values.has(key) &&
    values.get(key) !== "",
);
const output = uniqueKeys.map((key) => `${key}=${values.get(key)}`).join("\n");

fs.writeFileSync(destinationPath, `${output}\n`, { mode: 0o600 });
fs.chmodSync(destinationPath, 0o600);
if (deleteSourceFlag === "--delete-source") {
  fs.rmSync(sourcePath);
}
console.log(
  `Production environment prepared with ${uniqueKeys.length} approved variables; no values printed.`,
);
