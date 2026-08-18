import { relations } from "drizzle-orm";
import {
  bigserial,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const session = pgTable("session", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
}).enableRLS();

export const account = pgTable("account", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}).enableRLS();

export const verification = pgTable("verification", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
}).enableRLS();

export const apikey = pgTable("apiKey", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: timestamp("lastRefillAt"),
  enabled: boolean("enabled"),
  rateLimitEnabled: boolean("rateLimitEnabled"),
  rateLimitTimeWindow: integer("rateLimitTimeWindow"),
  rateLimitMax: integer("rateLimitMax"),
  requestCount: integer("requestCount"),
  remaining: integer("remaining"),
  lastRequest: timestamp("lastRequest"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
}).enableRLS();

export const apiKeyRelations = relations(apikey, ({ one }) => ({
  user: one(users, {
    fields: [apikey.userId],
    references: [users.id],
    relationName: "apiKeyUser",
  }),
}));

/**
 * OAuth 2.1 tables for the Better Auth oidc-provider plugin, which lets MCP
 * clients that cannot hold a static API key — ChatGPT above all — authenticate
 * as a user. Column names follow the plugin's own field names exactly; it
 * queries by these, so renaming any of them breaks the flow at runtime rather
 * than at build.
 */
export const oauthApplication = pgTable("oauthApplication", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  // Clients register themselves, so this is issued rather than chosen.
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  redirectUrls: text("redirectUrls").notNull(),
  type: text("type").notNull(),
  disabled: boolean("disabled").default(false),
  userId: uuid("userId").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}).enableRLS();

export const oauthAccessToken = pgTable("oauthAccessToken", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  accessToken: text("accessToken").notNull().unique(),
  refreshToken: text("refreshToken").notNull().unique(),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt").notNull(),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt").notNull(),
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: uuid("userId").references(() => users.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}).enableRLS();

export const oauthConsent = pgTable("oauthConsent", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  scopes: text("scopes").notNull(),
  consentGiven: boolean("consentGiven").notNull(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
}).enableRLS();
