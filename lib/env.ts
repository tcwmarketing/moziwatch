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
    .default("https://api.open-meteo.com/v1/ecmwf"),
  OPEN_METEO_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
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
  appName: process.env.NEXT_PUBLIC_APP_NAME || "Camp Signal",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  basemapMode: process.env.NEXT_PUBLIC_BASEMAP_MODE || "hosted",
  protomapsStyleUrl:
    process.env.NEXT_PUBLIC_PROTOMAPS_STYLE_URL ||
    "https://api.protomaps.com/styles/v5/light/en.json?key={key}",
  protomapsApiKey: process.env.NEXT_PUBLIC_PROTOMAPS_API_KEY || "",
  protomapsPmtilesUrl: process.env.NEXT_PUBLIC_PROTOMAPS_PMTILES_URL || "",
};
