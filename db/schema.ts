import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const moderationStatus = pgEnum("moderation_status", [
  "pending",
  "published",
  "hidden",
  "rejected",
  "deleted",
]);
export const forecastRunStatus = pgEnum("forecast_run_status", [
  "queued",
  "running",
  "published",
  "failed",
]);
export const importStatus = pgEnum("import_status", [
  "preview",
  "committed",
  "failed",
]);
export const userRole = pgEnum("user_role", ["member", "admin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("member"),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("account_provider_account_uidx").on(
      table.providerId,
      table.accountId,
    ),
    index("account_user_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const campgrounds = pgTable(
  "campgrounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    address: varchar("address", { length: 220 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    region: varchar("region", { length: 100 }).notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    website: text("website"),
    description: text("description"),
    dataSource: text("data_source").notNull().default("development-seed"),
    dataLicense: text("data_license").notNull().default("development-only"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campgrounds_active_idx").on(table.active),
    index("campgrounds_name_idx").on(table.name),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id),
    rating: integer("rating").notNull(),
    comment: varchar("comment", { length: 800 }),
    accountId: text("account_id").references(() => user.id, {
      onDelete: "set null",
    }),
    anonymousTokenHash: text("anonymous_token_hash"),
    ipHash: text("ip_hash").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    moderationStatus: moderationStatus("moderation_status")
      .notNull()
      .default("published"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("reports_campground_date_idx").on(
      table.campgroundId,
      table.submittedAt,
    ),
    index("reports_account_idx").on(table.accountId),
    index("reports_anonymous_idx").on(table.anonymousTokenHash),
    index("reports_ip_idx").on(table.ipHash),
    index("reports_moderation_idx").on(table.moderationStatus),
  ],
);

export const reportAudit = pgTable(
  "report_audit",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => reports.id),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 80 }).notNull(),
    previousStatus: moderationStatus("previous_status"),
    nextStatus: moderationStatus("next_status"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("report_audit_report_idx").on(table.reportId),
    index("report_audit_actor_idx").on(table.actorId),
  ],
);

export const savedCampgrounds = pgTable(
  "saved_campgrounds",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.campgroundId] }),
    index("saved_campgrounds_campground_idx").on(table.campgroundId),
  ],
);

export const campgroundAggregates = pgTable("campground_aggregates", {
  campgroundId: uuid("campground_id")
    .primaryKey()
    .references(() => campgrounds.id),
  recentAverage: real("recent_average"),
  recentCount: integer("recent_count").notNull().default(0),
  historicalAverage: real("historical_average"),
  historicalCount: integer("historical_count").notNull().default(0),
  mostRecentReportAt: timestamp("most_recent_report_at", {
    withTimezone: true,
  }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const forecastModels = pgTable("forecast_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: varchar("version", { length: 80 }).notNull().unique(),
  modelKind: varchar("model_kind", { length: 80 }).notNull(),
  artifact: jsonb("artifact").$type<Record<string, unknown>>().notNull(),
  evaluation: jsonb("evaluation").$type<Record<string, unknown>>().notNull(),
  modelCreatedAt: timestamp("model_created_at", {
    withTimezone: true,
  }).notNull(),
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const forecastRuns = pgTable(
  "forecast_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => forecastModels.id),
    forecastDate: timestamp("forecast_date", { withTimezone: true }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }),
    status: forecastRunStatus("status").notNull().default("queued"),
    source: varchar("source", { length: 80 }).notNull().default("open-meteo"),
    isSynthetic: boolean("is_synthetic").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forecast_run_model_date_uidx").on(
      table.modelId,
      table.forecastDate,
    ),
  ],
);

export const weatherObservations = pgTable(
  "weather_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    cellKey: varchar("cell_key", { length: 80 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    observedFor: timestamp("observed_for", { withTimezone: true }).notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    variables: jsonb("variables")
      .$type<Record<string, number | null>>()
      .notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("weather_run_cell_uidx").on(table.runId, table.cellKey),
  ],
);

export const forecastCells = pgTable(
  "forecast_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    cellKey: varchar("cell_key", { length: 80 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    score: real("score").notNull(),
    cellGeoJson: jsonb("cell_geojson")
      .$type<Record<string, unknown>>()
      .notNull(),
    features: jsonb("features").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("forecast_cell_run_key_uidx").on(table.runId, table.cellKey),
    index("forecast_cell_run_idx").on(table.runId),
  ],
);

export const forecastJobLogs = pgTable(
  "forecast_job_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").references(() => forecastRuns.id, {
      onDelete: "set null",
    }),
    level: varchar("level", { length: 20 }).notNull(),
    message: text("message").notNull(),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("forecast_job_logs_run_idx").on(table.runId)],
);

export const campgroundImports = pgTable(
  "campground_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    status: importStatus("status").notNull().default("preview"),
    filename: text("filename").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull(),
    rows: jsonb("rows").$type<Array<Record<string, unknown>>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (table) => [index("campground_imports_actor_idx").on(table.actorId)],
);

export const adminAuditLogs = pgTable(
  "admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: text("target_id"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("admin_audit_logs_actor_idx").on(table.actorId)],
);
