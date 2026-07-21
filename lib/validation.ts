import { z } from "zod";

export const reportInput = z
  .object({
    campgroundId: z.string().uuid(),
    rating: z.coerce.number().int().min(1).max(5),
    comment: z
      .string()
      .trim()
      .max(800)
      .optional()
      .transform((value) => value || null),
    botToken: z.string().optional(),
    observationMode: z.enum(["recent", "older"]).default("recent"),
    observedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.observationMode === "older" && !value.observedOn)
      context.addIssue({
        code: "custom",
        path: ["observedOn"],
        message: "Choose the date you observed the conditions.",
      });
    if (value.observedOn) {
      const selected = Date.parse(`${value.observedOn}T12:00:00Z`);
      const today = new Date().toISOString().slice(0, 10);
      const isCalendarDate =
        Number.isFinite(selected) &&
        new Date(selected).toISOString().slice(0, 10) === value.observedOn;
      if (!isCalendarDate || value.observedOn > today)
        context.addIssue({
          code: "custom",
          path: ["observedOn"],
          message: "The observation date cannot be in the future.",
        });
      if (value.observedOn < "2000-01-01")
        context.addIssue({
          code: "custom",
          path: ["observedOn"],
          message: "Choose a date in 2000 or later.",
        });
    }
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
