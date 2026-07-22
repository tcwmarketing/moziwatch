import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  IP_HASH_SECRET: z.string().min(32),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  OPEN_METEO_BASE_URL: z
    .string()
    .url()
    .default("https://api.open-meteo.com/v1/forecast"),
  OPEN_METEO_API_KEY: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["brevo", "console"]).default("console"),
  BREVO_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
  CONTACT_RECIPIENT_EMAIL: z.string().email().optional(),
  BOT_PROTECTION_PROVIDER: z
    .enum(["none", "recaptcha-enterprise"])
    .default("none"),
  GOOGLE_API_KEY: z.string().min(1).optional(),
  GOOGLE_CLOUD_PROJECT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: z.string().min(1).optional(),
  RECAPTCHA_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.3),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MODE: z.enum(["test", "live"]).default("test"),
  STRIPE_DONATION_CURRENCY: z.string().length(3).default("cad"),
  FORECAST_MODEL_PATH: z.string().default("./config/models/current.json"),
});

export function getServerEnv() {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

export const publicEnv = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "MoziWatch",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  basemapMode: process.env.NEXT_PUBLIC_BASEMAP_MODE || "hosted",
  protomapsStyleUrl:
    process.env.NEXT_PUBLIC_PROTOMAPS_STYLE_URL ||
    "https://api.protomaps.com/styles/v5/light/en.json?key={key}",
  protomapsApiKey: process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY || "",
  protomapsPmtilesUrl: process.env.NEXT_PUBLIC_PROTOMAPS_PMTILES_URL || "",
  recaptchaSiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY || "",
};
