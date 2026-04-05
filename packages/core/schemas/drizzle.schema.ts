import {
  pgTable,
  uuid,
  varchar,
  text,
  doublePrecision,
  timestamp,
  boolean,
  integer,
  date,
  uniqueIndex,
  index,
  bigserial,
  smallint,
  jsonb,
} from "drizzle-orm/pg-core";


// ── Mosques ──────────────────────────────────────────────────────────────────

export const mosques = pgTable(
  "mosques",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    postcode: varchar("postcode", { length: 20 }).notNull(),
    country: varchar("country", { length: 10 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    website: varchar("website", { length: 500 }),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    timezone: varchar("timezone", { length: 64 }).notNull().default("UTC"),
    facilities: text("facilities").notNull().default("[]"),
    verificationStatus: text("verification_status").notNull().default("pending"),
    logoUrl: text("logo_url"),
    coverUrl: text("cover_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("mosques_city_idx").on(table.city),
    index("mosques_created_at_id_idx").on(table.createdAt, table.id),
  ],
);

// ── Admins ───────────────────────────────────────────────────────────────────

export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  mosqueId: uuid("mosque_id").references(() => mosques.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Prayer Times ─────────────────────────────────────────────────────────────

export const prayerTimes = pgTable(
  "prayer_times",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mosqueId: uuid("mosque_id")
      .notNull()
      .references(() => mosques.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    fajr: varchar("fajr", { length: 10 }).notNull(),
    dhuhr: varchar("dhuhr", { length: 10 }).notNull(),
    asr: varchar("asr", { length: 10 }).notNull(),
    maghrib: varchar("maghrib", { length: 10 }).notNull(),
    isha: varchar("isha", { length: 10 }).notNull(),
    jummah: varchar("jummah", { length: 10 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("prayer_times_mosque_date_idx").on(table.mosqueId, table.date),
  ],
);

// ── API Keys ─────────────────────────────────────────────────────────────────

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    prefix: varchar("prefix", { length: 20 }).notNull().unique(),
    keyHash: text("key_hash").notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    rateLimit: integer("rate_limit").notNull().default(100),
    isActive: boolean("is_active").notNull().default(true),
    analyticsEnabled: boolean("analytics_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("api_keys_key_hash_idx").on(table.keyHash)],
);

// ── Request Logs ────────────────────────────────────────────────────────────

export const requestLogs = pgTable(
  "request_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestId: varchar("request_id", { length: 36 }).notNull(),
    method: varchar("method", { length: 10 }).notNull(),
    path: varchar("path", { length: 255 }).notNull(),
    statusCode: smallint("status_code").notNull(),
    responseTime: integer("response_time").notNull(),
    responseSize: integer("response_size"),
    apiKeyPrefix: varchar("api_key_prefix", { length: 8 }),
    userAgent: varchar("user_agent", { length: 500 }),
    clientIp: varchar("client_ip", { length: 45 }),
    routeMatched: varchar("route_matched", { length: 100 }),
  },
  (table) => [
    index("request_logs_timestamp_idx").on(table.timestamp),
    index("request_logs_api_key_prefix_idx").on(table.apiKeyPrefix),
    index("request_logs_path_timestamp_idx").on(table.path, table.timestamp),
    index("request_logs_request_id_idx").on(table.requestId),
    index("request_logs_status_code_idx").on(table.statusCode),
  ],
);

// ── Application Logs ────────────────────────────────────────────────────────

export const applicationLogs = pgTable(
  "application_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requestId: varchar("request_id", { length: 36 }),
    level: varchar("level", { length: 10 }).notNull(),
    message: varchar("message", { length: 1000 }).notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    attributes: jsonb("attributes"),
    errorStack: text("error_stack"),
  },
  (table) => [
    index("application_logs_timestamp_idx").on(table.timestamp),
    index("application_logs_request_id_idx").on(table.requestId),
    index("application_logs_level_idx").on(table.level),
    index("application_logs_source_idx").on(table.source),
    index("application_logs_attributes_idx").using("gin", table.attributes),
  ],
);
