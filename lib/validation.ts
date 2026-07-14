import { z } from "zod";

export const reportInput = z.object({
  campgroundId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z
    .string()
    .trim()
    .max(800)
    .optional()
    .transform((value) => value || null),
  botToken: z.string().optional(),
});

export const campgroundInput = z.object({
  name: z.string().trim().min(2).max(160),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(180),
  address: z.string().trim().min(2).max(220),
  city: z.string().trim().min(2).max(100),
  region: z.string().trim().min(2).max(100),
  country: z.enum(["CA", "US"]),
  postalCode: z.string().trim().min(3).max(20),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  website: z.string().url().optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional(),
});
