import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  doublePrecision,
  geometry,
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
import { sql } from "drizzle-orm";
import type { CampgroundFiveDayWeather } from "@/config/weather";

export const moderationStatus = pgEnum("moderation_status", [
  "pending",
  "published",
  "spam",
  "hidden",
  "rejected",
  "deleted",
]);
export const contactSubmissionStatus = pgEnum("contact_submission_status", [
  "inbox",
  "spam",
  "archived",
]);
export const forecastRunStatus = pgEnum("forecast_run_status", [
  "queued",
  "running",
  "published",
  "failed",
]);
export const forecastCadence = pgEnum("forecast_cadence", [
  "daily",
  "weekly",
  "paused",
]);
export const importStatus = pgEnum("import_status", [
  "preview",
  "committed",
  "failed",
]);
export const userRole = pgEnum("user_role", ["member", "admin"]);
export const locationType = pgEnum("location_type", [
  "developed_campground",
  "rv_park",
  "backcountry_campground",
  "group_campground",
  "other_established_campground",
]);
export const locationVerificationStatus = pgEnum(
  "location_verification_status",
  ["unverified", "source_verified", "owner_verified", "manually_verified"],
);
export const locationOperationalStatus = pgEnum("location_operational_status", [
  "active",
  "seasonal",
  "closed",
  "review",
]);
export const campsiteCountKind = pgEnum("campsite_count_kind", [
  "official_total",
  "reservable_inventory",
  "mapped_capacity",
]);
export const locationImportRunStatus = pgEnum("location_import_run_status", [
  "running",
  "completed",
  "failed",
  "partial",
]);
export const locationMergeReviewStatus = pgEnum(
  "location_merge_review_status",
  ["pending", "approved", "rejected", "separate"],
);
export const locationDeletionReviewStatus = pgEnum(
  "location_deletion_review_status",
  ["pending", "approved", "dismissed"],
);
export const locationSuggestionStatus = pgEnum("location_suggestion_status", [
  "pending",
  "approved",
  "rejected",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  homeCity: varchar("home_city", { length: 120 }),
  homeCityRegion: varchar("home_city_region", { length: 120 }),
  homeCityCountry: varchar("home_city_country", { length: 2 }),
  homeCityLatitude: doublePrecision("home_city_latitude"),
  homeCityLongitude: doublePrecision("home_city_longitude"),
  homeCityPlaceId: text("home_city_place_id"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("member"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
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
    impersonatedBy: text("impersonated_by"),
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
    normalizedName: varchar("normalized_name", { length: 180 })
      .notNull()
      .default(""),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    locationType: locationType("location_type")
      .notNull()
      .default("developed_campground"),
    parentId: uuid("parent_id").references((): AnyPgColumn => campgrounds.id, {
      onDelete: "set null",
    }),
    address: varchar("address", { length: 220 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    region: varchar("region", { length: 100 }).notNull(),
    country: varchar("country", { length: 2 }).notNull(),
    postalCode: varchar("postal_code", { length: 20 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    point: geometry("point", { type: "point", srid: 4326 })
      .generatedAlwaysAs(
        sql`extensions.st_setsrid(extensions.st_makepoint("longitude", "latitude"), 4326)`,
      )
      .notNull(),
    sourceGeometry: jsonb("source_geometry").$type<Record<string, unknown>>(),
    operator: text("operator"),
    phone: varchar("phone", { length: 60 }),
    reservationUrl: text("reservation_url"),
    website: text("website"),
    dataSource: text("data_source").notNull().default("development-seed"),
    active: boolean("active").notNull().default(true),
    operationalStatus: locationOperationalStatus("operational_status")
      .notNull()
      .default("active"),
    verificationStatus: locationVerificationStatus("verification_status")
      .notNull()
      .default("unverified"),
    manualLocks: text("manual_locks").array().notNull().default([]),
    fieldProvenance: jsonb("field_provenance")
      .$type<
        Record<
          string,
          | [source: string, priority: number]
          | { source: string; priority: number }
        >
      >()
      .notNull()
      .default({}),
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
    index("campgrounds_parent_idx").on(table.parentId),
    index("campgrounds_country_region_idx").on(table.country, table.region),
    index("campgrounds_point_gist_idx").using("gist", table.point),
  ],
);

export const locationImportRuns = pgTable(
  "location_import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 80 }).notNull(),
    status: locationImportRunStatus("status").notNull().default("running"),
    datasetVersion: text("dataset_version"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    downloaded: integer("records_downloaded").notNull().default(0),
    accepted: integer("records_accepted").notNull().default(0),
    excluded: integer("records_excluded").notNull().default(0),
    invalidCoordinates: integer("invalid_coordinates").notNull().default(0),
    duplicatesPrevented: integer("duplicates_prevented").notNull().default(0),
    inserted: integer("records_inserted").notNull().default(0),
    updated: integer("records_updated").notNull().default(0),
    unchanged: integer("records_unchanged").notNull().default(0),
    matched: integer("records_matched").notNull().default(0),
    mergeCandidates: integer("merge_candidates_created").notNull().default(0),
    skipped: integer("records_skipped").notNull().default(0),
    errors: jsonb("errors")
      .$type<Array<Record<string, unknown>>>()
      .notNull()
      .default([]),
    checkpoint: jsonb("checkpoint")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    dryRun: boolean("dry_run").notNull().default(false),
    options: jsonb("options")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => [
    index("location_import_runs_source_started_idx").on(
      table.source,
      table.startedAt,
    ),
  ],
);

export const locationSourceProviders = pgTable("location_source_providers", {
  source: varchar("source", { length: 80 }).primaryKey(),
  license: varchar("license", { length: 120 }).notNull(),
  attribution: text("attribution").notNull(),
  defaultPriority: integer("default_priority").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locationSourceRecords = pgTable(
  "location_source_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 80 })
      .notNull()
      .references(() => locationSourceProviders.source),
    externalId: varchar("external_id", { length: 240 }).notNull(),
    campgroundId: uuid("campground_id").references(() => campgrounds.id, {
      onDelete: "set null",
    }),
    sourceUrl: text("source_url"),
    sourceRecordUrl: text("source_record_url"),
    sourceRelease: text("source_release"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    authoritative: boolean("authoritative").notNull().default(false),
    importStatus: varchar("import_status", { length: 40 })
      .notNull()
      .default("accepted"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    consecutiveMissingCount: integer("consecutive_missing_count")
      .notNull()
      .default(0),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    normalizedPayload: jsonb("normalized_payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    sourceGeometry: jsonb("source_geometry").$type<Record<string, unknown>>(),
    contactEmails: text("contact_emails").array().notNull().default([]),
    relatedUrls: text("related_urls").array().notNull().default([]),
    representativePoint: geometry("representative_point", {
      type: "point",
      srid: 4326,
    }).notNull(),
    sourcePriority: integer("source_priority").notNull().default(50),
    campsiteCount: integer("campsite_count"),
    campsiteCountKind: campsiteCountKind("campsite_count_kind"),
    campsiteCountSourceUpdatedAt: timestamp(
      "campsite_count_source_updated_at",
      { withTimezone: true },
    ),
    campsiteCountCheckedAt: timestamp("campsite_count_checked_at", {
      withTimezone: true,
    }),
    importRunId: uuid("import_run_id")
      .notNull()
      .references(() => locationImportRuns.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("location_source_records_source_external_uidx").on(
      table.source,
      table.externalId,
    ),
    index("location_source_records_campground_idx").on(table.campgroundId),
    index("location_source_records_run_idx").on(table.importRunId),
    index("location_source_records_source_seen_idx").on(
      table.source,
      table.lastSeenAt,
    ),
    index("location_source_records_point_gist_idx").using(
      "gist",
      table.representativePoint,
    ),
    index("location_source_records_capacity_idx")
      .on(table.campgroundId, table.sourcePriority)
      .where(sql`${table.campsiteCount} IS NOT NULL`),
    index("location_source_records_directory_capacity_idx")
      .on(
        table.campgroundId,
        sql`(CASE ${table.campsiteCountKind}
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1 END) DESC`,
        sql`${table.authoritative} DESC`,
        sql`${table.sourcePriority} DESC`,
        sql`${table.campsiteCountCheckedAt} DESC NULLS LAST`,
        table.campsiteCount,
      )
      .where(
        sql`${table.campsiteCount} IS NOT NULL AND ${table.campgroundId} IS NOT NULL`,
      ),
    check(
      "location_source_records_campsite_count_check",
      sql`${table.campsiteCount} IS NULL OR ${table.campsiteCount} BETWEEN 1 AND 100000`,
    ),
  ],
);

export const locationSourceTombstones = pgTable(
  "location_source_tombstones",
  {
    source: varchar("source", { length: 80 }).notNull(),
    externalId: varchar("external_id", { length: 240 }).notNull(),
    reasonCode: varchar("reason_code", { length: 80 }).notNull(),
    ruleVersion: varchar("rule_version", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 180 }).notNull(),
    country: varchar("country", { length: 2 }),
    region: varchar("region", { length: 100 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    sourceConfidence: real("source_confidence"),
    primaryCategory: varchar("primary_category", { length: 100 }),
    sourceRelease: text("source_release"),
    sourceChecksum: varchar("source_checksum", { length: 64 }),
    firstRejectedAt: timestamp("first_rejected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastRejectedAt: timestamp("last_rejected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.source, table.externalId] }),
    index("location_source_tombstones_reason_idx").on(table.reasonCode),
    index("location_source_tombstones_name_idx").on(table.normalizedName),
  ],
);

export const locationMergeCandidates = pgTable(
  "location_merge_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceRecordId: uuid("source_record_id")
      .notNull()
      .references(() => locationSourceRecords.id, { onDelete: "cascade" }),
    suggestedCampgroundId: uuid("suggested_campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    matchScore: real("match_score").notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    distanceMeters: real("distance_meters"),
    nameSimilarity: real("name_similarity"),
    websiteMatch: boolean("website_match").notNull().default(false),
    phoneMatch: boolean("phone_match").notNull().default(false),
    status: locationMergeReviewStatus("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("location_merge_candidate_pair_uidx").on(
      table.sourceRecordId,
      table.suggestedCampgroundId,
    ),
    index("location_merge_candidates_status_idx").on(
      table.status,
      table.createdAt,
    ),
  ],
);

export const canonicalDuplicateCandidates = pgTable(
  "canonical_duplicate_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leftCampgroundId: uuid("left_campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    rightCampgroundId: uuid("right_campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    suggestedSurvivorId: uuid("suggested_survivor_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    matchScore: real("match_score").notNull(),
    recommendation: varchar("recommendation", { length: 20 }).notNull(),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    distanceMeters: real("distance_meters"),
    nameSimilarity: real("name_similarity").notNull(),
    websiteMatch: boolean("website_match").notNull().default(false),
    phoneMatch: boolean("phone_match").notNull().default(false),
    addressMatch: boolean("address_match").notNull().default(false),
    status: locationMergeReviewStatus("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("canonical_duplicate_candidate_pair_uidx").on(
      table.leftCampgroundId,
      table.rightCampgroundId,
    ),
    index("canonical_duplicate_candidates_queue_idx").on(
      table.status,
      table.matchScore,
    ),
    index("canonical_duplicate_candidates_left_idx").on(table.leftCampgroundId),
    index("canonical_duplicate_candidates_right_idx").on(
      table.rightCampgroundId,
    ),
  ],
);

export const locationDeletionCandidates = pgTable(
  "location_deletion_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    confidence: real("confidence").notNull(),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    evidence: jsonb("evidence")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    status: locationDeletionReviewStatus("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    firstDetectedAt: timestamp("first_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastDetectedAt: timestamp("last_detected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("location_deletion_candidate_campground_uidx").on(
      table.campgroundId,
    ),
    index("location_deletion_candidates_queue_idx").on(
      table.status,
      table.confidence,
    ),
    index("location_deletion_candidates_reviewer_idx").on(table.reviewerId),
  ],
);

export const locationAliases = pgTable(
  "location_aliases",
  {
    slug: varchar("slug", { length: 180 }).primaryKey(),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("location_aliases_campground_idx").on(table.campgroundId)],
);

export const locationSuggestions = pgTable(
  "location_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campgroundId: uuid("campground_id").references(() => campgrounds.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 40 }).notNull(),
    name: varchar("name", { length: 160 }),
    country: varchar("country", { length: 2 }),
    region: varchar("region", { length: 100 }),
    locality: varchar("locality", { length: 100 }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    comment: varchar("comment", { length: 1500 }).notNull(),
    submitterEmail: varchar("submitter_email", { length: 254 }),
    status: locationSuggestionStatus("status").notNull().default("pending"),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("location_suggestions_status_idx").on(table.status, table.createdAt),
  ],
);

export const contactSubmissions = pgTable(
  "contact_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 80 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    subject: varchar("subject", { length: 160 }).notNull(),
    message: varchar("message", { length: 3000 }).notNull(),
    status: contactSubmissionStatus("status").notNull().default("inbox"),
    spamReasons: jsonb("spam_reasons").$type<string[]>().notNull().default([]),
    ipHash: text("ip_hash").notNull(),
    emailHash: text("email_hash"),
    contentFingerprint: varchar("content_fingerprint", { length: 16 }),
    formProofValid: boolean("form_proof_valid").notNull().default(false),
    botProvider: varchar("bot_provider", { length: 40 })
      .notNull()
      .default("none"),
    botVerified: boolean("bot_verified").notNull().default(false),
    botAssessmentId: text("bot_assessment_id"),
    botScore: real("bot_score"),
    botReasons: jsonb("bot_reasons").$type<string[]>().notNull().default([]),
    botAction: varchar("bot_action", { length: 80 }),
    botHostname: varchar("bot_hostname", { length: 253 }),
    botInvalidReason: varchar("bot_invalid_reason", { length: 80 }),
    botAnnotation: varchar("bot_annotation", { length: 20 }),
    botAnnotatedAt: timestamp("bot_annotated_at", { withTimezone: true }),
    reviewerId: text("reviewer_id").references(() => user.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contact_submissions_status_created_idx").on(
      table.status,
      table.createdAt,
    ),
    index("contact_submissions_ip_created_idx").on(
      table.ipHash,
      table.createdAt,
    ),
    index("contact_submissions_email_created_idx").on(
      table.emailHash,
      table.createdAt,
    ),
    index("contact_submissions_fingerprint_created_idx").on(
      table.contentFingerprint,
      table.createdAt,
    ),
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
    observedOn: date("observed_on")
      .notNull()
      .default(sql`CURRENT_DATE`),
    moderationStatus: moderationStatus("moderation_status")
      .notNull()
      .default("published"),
    spamReasons: jsonb("spam_reasons").$type<string[]>().notNull().default([]),
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
    index("reports_campground_observed_idx").on(
      table.campgroundId,
      table.observedOn,
    ),
    index("reports_account_idx").on(table.accountId),
    index("reports_anonymous_idx").on(table.anonymousTokenHash),
    index("reports_ip_idx").on(table.ipHash),
    index("reports_moderation_idx").on(table.moderationStatus),
    index("reports_forecast_evidence_idx")
      .on(table.campgroundId, table.observedOn, table.submittedAt)
      .where(
        sql`${table.moderationStatus} = 'published' AND ${table.deletedAt} IS NULL`,
      ),
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
  reportSummaryPhrases: text("report_summary_phrases")
    .array()
    .notNull()
    .default([]),
  reportSummaryReportCount: integer("report_summary_report_count")
    .notNull()
    .default(0),
  reportSummaryGeneratedAt: timestamp("report_summary_generated_at", {
    withTimezone: true,
  }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const donations = pgTable(
  "donations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    checkoutSessionId: varchar("checkout_session_id", { length: 255 })
      .notNull()
      .unique(),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    status: varchar("status", { length: 30 }).notNull().default("pending"),
    donorEmail: varchar("donor_email", { length: 320 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("donations_status_created_idx").on(table.status, table.createdAt),
    index("donations_payment_intent_idx").on(table.paymentIntentId),
    check(
      "donations_amount_check",
      sql`${table.amountMinor} BETWEEN 100 AND 50000`,
    ),
  ],
);

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
    isProduction: boolean("is_production").notNull().default(true),
    deploymentMode: varchar("deployment_mode", { length: 20 })
      .notNull()
      .default("v2"),
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

export const habitatProfileVersions = pgTable("habitat_profile_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  version: varchar("version", { length: 80 }).notNull().unique(),
  dataKind: varchar("data_kind", { length: 40 }).notNull(),
  sourceManifest: jsonb("source_manifest")
    .$type<Record<string, unknown>>()
    .notNull(),
  methodNotes: text("method_notes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campgroundHabitatProfiles = pgTable(
  "campground_habitat_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    profileVersionId: uuid("profile_version_id")
      .notNull()
      .references(() => habitatProfileVersions.id),
    wetlandCoverage: jsonb("wetland_coverage")
      .$type<Record<string, number>>()
      .notNull(),
    marshCoverage: jsonb("marsh_coverage")
      .$type<Record<string, number>>()
      .notNull(),
    seasonalWaterCoverage: jsonb("seasonal_water_coverage")
      .$type<Record<string, number>>()
      .notNull(),
    forestCoverage: jsonb("forest_coverage")
      .$type<Record<string, number>>()
      .notNull(),
    smallWaterBodyDensity: real("small_water_body_density").notNull(),
    stagnantWaterPotential: real("stagnant_water_potential").notNull(),
    lakeShorelineProximity: real("lake_shoreline_proximity").notNull(),
    shorelineWaterEdgeLengthKm: real("shoreline_water_edge_length_km")
      .notNull()
      .default(0),
    largeOpenWaterCoverage: real("large_open_water_coverage").notNull(),
    fastRiverProximity: real("fast_river_proximity").notNull(),
    slowRiverProximity: real("slow_river_proximity").notNull(),
    vegetationCoverage: real("vegetation_coverage").notNull(),
    elevationM: real("elevation_m").notNull(),
    slopeDegrees: real("slope_degrees").notNull(),
    drainagePotential: real("drainage_potential").notNull(),
    floodplainExposure: real("floodplain_exposure").notNull().default(0),
    annualRainfallMm: real("annual_rainfall_mm").notNull(),
    warmSeasonRainfallMm: real("warm_season_rainfall_mm").notNull(),
    landCoverType: varchar("land_cover_type", { length: 80 }).notNull(),
    profileConfidence: real("profile_confidence").notNull(),
    archetype: varchar("archetype", { length: 80 }),
    sourceProvenance: jsonb("source_provenance")
      .$type<Record<string, unknown>>()
      .notNull(),
    dataCoverage: jsonb("data_coverage")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    active: boolean("active").notNull().default(false),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("campground_habitat_profile_version_uidx").on(
      table.campgroundId,
      table.profileVersionId,
    ),
    uniqueIndex("campground_habitat_active_uidx")
      .on(table.campgroundId)
      .where(sql`${table.active} = true`),
    index("campground_habitat_version_idx").on(table.profileVersionId),
  ],
);

export const campgroundWeatherObservations = pgTable(
  "campground_weather_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    observedFor: timestamp("observed_for", { withTimezone: true }).notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    variables: jsonb("variables")
      .$type<Record<string, number | string>>()
      .notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("campground_weather_run_date_uidx").on(
      table.runId,
      table.campgroundId,
      table.observedFor,
    ),
    index("campground_weather_campground_date_idx").on(
      table.campgroundId,
      table.observedFor,
    ),
  ],
);

export const campgroundWeatherCache = pgTable("campground_weather_cache", {
  campgroundId: uuid("campground_id")
    .primaryKey()
    .references(() => campgrounds.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 80 }),
  forecast: jsonb("forecast").$type<CampgroundFiveDayWeather>(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  refreshStartedAt: timestamp("refresh_started_at", { withTimezone: true }),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campgroundWeatherHistoryDaily = pgTable(
  "campground_weather_history_daily",
  {
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    observedOn: date("observed_on").notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    weatherRunAt: timestamp("weather_run_at", { withTimezone: true }).notNull(),
    variables: jsonb("variables").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.campgroundId, table.observedOn, table.provider],
    }),
    index("campground_weather_history_date_idx").on(table.observedOn),
  ],
);

export const campgroundForecasts = pgTable(
  "campground_forecasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    habitatProfileId: uuid("habitat_profile_id")
      .notNull()
      .references(() => campgroundHabitatProfiles.id),
    targetDate: timestamp("target_date", { withTimezone: true }).notNull(),
    dayOffset: integer("day_offset").notNull(),
    score: real("score").notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    confidence: real("confidence").notNull(),
    factors: jsonb("factors").$type<string[]>().notNull(),
    components: jsonb("components").$type<Record<string, number>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("campground_forecast_run_date_uidx").on(
      table.runId,
      table.campgroundId,
      table.targetDate,
    ),
    index("campground_forecast_campground_date_idx").on(
      table.campgroundId,
      table.targetDate,
    ),
    index("campground_forecast_run_offset_idx").on(
      table.runId,
      table.dayOffset,
    ),
    index("campground_forecast_profile_idx").on(table.habitatProfileId),
  ],
);

export const campgroundForecastEvidence = pgTable(
  "campground_forecast_evidence",
  {
    forecastId: uuid("forecast_id")
      .primaryKey()
      .references(() => campgroundForecasts.id, { onDelete: "cascade" }),
    modelConfigVersion: varchar("model_config_version", {
      length: 100,
    }).notNull(),
    weatherProvider: varchar("weather_provider", { length: 80 }).notNull(),
    weatherRunAt: timestamp("weather_run_at", { withTimezone: true }).notNull(),
    environmentalResult: jsonb("environmental_result")
      .$type<Record<string, unknown>>()
      .notNull(),
    recentReportResult: jsonb("recent_report_result")
      .$type<Record<string, unknown>>()
      .notNull(),
    historicalReportResult: jsonb("historical_report_result")
      .$type<Record<string, unknown>>()
      .notNull(),
    componentWeights: jsonb("component_weights")
      .$type<Record<string, number>>()
      .notNull(),
    finalResult: jsonb("final_result")
      .$type<Record<string, unknown>>()
      .notNull(),
    confidenceReasons: jsonb("confidence_reasons").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const campgroundForecastSchedules = pgTable(
  "campground_forecast_schedules",
  {
    campgroundId: uuid("campground_id")
      .primaryKey()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    cadence: forecastCadence("cadence").notNull().default("paused"),
    priorityScore: integer("priority_score").notNull().default(0),
    reasonCodes: jsonb("reason_codes").$type<string[]>().notNull().default([]),
    nextRefreshAt: timestamp("next_refresh_at", { withTimezone: true }),
    lastRequestedAt: timestamp("last_requested_at", { withTimezone: true }),
    dailyUntil: timestamp("daily_until", { withTimezone: true }),
    manualOverride: forecastCadence("manual_override"),
    operatingStatus: varchar("operating_status", { length: 30 })
      .notNull()
      .default("active"),
    lastForecastAt: timestamp("last_forecast_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campground_forecast_schedule_due_idx")
      .on(table.nextRefreshAt)
      .where(sql`${table.cadence} <> 'paused'`),
    index("campground_forecast_schedule_cadence_idx").on(table.cadence),
  ],
);

export const campgroundForecastInterestDaily = pgTable(
  "campground_forecast_interest_daily",
  {
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    activityDate: timestamp("activity_date", { withTimezone: true }).notNull(),
    detailViews: integer("detail_views").notNull().default(0),
    forecastRequests: integer("forecast_requests").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.campgroundId, table.activityDate] }),
    index("campground_forecast_interest_date_idx").on(table.activityDate),
  ],
);

export const campgroundMonthlyOutlooks = pgTable(
  "campground_monthly_outlooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => forecastRuns.id, { onDelete: "cascade" }),
    campgroundId: uuid("campground_id")
      .notNull()
      .references(() => campgrounds.id, { onDelete: "cascade" }),
    habitatProfileId: uuid("habitat_profile_id")
      .notNull()
      .references(() => campgroundHabitatProfiles.id),
    targetMonth: timestamp("target_month", { withTimezone: true }).notNull(),
    score: real("score").notNull(),
    level: varchar("level", { length: 20 }).notNull(),
    confidence: real("confidence").notNull(),
    factors: jsonb("factors").$type<string[]>().notNull(),
    components: jsonb("components").$type<Record<string, number>>().notNull(),
    sourceKind: varchar("source_kind", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("campground_monthly_outlook_run_month_uidx").on(
      table.runId,
      table.campgroundId,
      table.targetMonth,
    ),
    index("campground_monthly_outlook_campground_month_idx").on(
      table.campgroundId,
      table.targetMonth,
    ),
    index("campground_monthly_outlook_profile_idx").on(table.habitatProfileId),
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
