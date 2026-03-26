/**
 * PostgreSQL schema — pg-core equivalent of the layer's SQLite schema.
 *
 * Faithfully mirrors every table from `schema.ts` but uses
 * `drizzle-orm/pg-core` instead of `drizzle-orm/sqlite-core`.
 *
 * Column names are identical so Drizzle queries work unchanged regardless
 * of which backend (`d1` or `postgres`) the app is configured for.
 *
 * Apps that set `NUXT_DATABASE_BACKEND=postgres` should import from this file
 * in their `server/database/schema.ts` instead of from `schema.ts`.
 */
import { pgTable, text, integer, serial, boolean } from 'drizzle-orm/pg-core'

// ─── Users ──────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(), // UUID
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  name: text('name'),
  appleId: text('apple_id').unique(),
  isAdmin: boolean('is_admin').default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Sessions ───────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // session token
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(), // Unix timestamp
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Todos (Demo) ───────────────────────────────────────────
export const todos = pgTable('todos', {
  id: serial('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  completed: boolean('completed').default(false),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── KV Cache ───────────────────────────────────────────────
export const kvCache = pgTable('kv_cache', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at').notNull(),
})

// ─── API Keys ───────────────────────────────────────────────
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // Human label, e.g. "validate-fleet CLI"
  keyHash: text('key_hash').notNull(), // SHA-256 of raw key
  keyPrefix: text('key_prefix').notNull(), // First 8 chars for display: "nk_a1b2…"
  lastUsedAt: text('last_used_at'),
  expiresAt: integer('expires_at'), // Nullable unix timestamp
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Notifications ──────────────────────────────────────────
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(), // UUID
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(), // 'system' | 'reminder' | 'social' | 'alert'
  title: text('title').notNull(),
  body: text('body').notNull(),
  icon: text('icon'), // Optional lucide icon name, e.g. 'i-lucide-bell'
  actionUrl: text('action_url'), // Optional deep-link path
  resourceType: text('resource_type'), // Optional domain entity type (e.g. 'wager', 'order')
  resourceId: text('resource_id'), // Optional domain entity ID
  isRead: boolean('is_read').notNull().default(false),
  readAt: text('read_at'),
  createdAt: text('created_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── System Prompts ─────────────────────────────────────────
export const systemPrompts = pgTable('system_prompts', {
  name: text('name').primaryKey(), // Simple string key, e.g., 'napkin_generator'
  content: text('content').notNull(),
  description: text('description').notNull(),
  updatedAt: text('updated_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
})

// ─── Type helpers ───────────────────────────────────────────
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Session = typeof sessions.$inferSelect
export type Todo = typeof todos.$inferSelect
export type NewTodo = typeof todos.$inferInsert
export type KvCacheEntry = typeof kvCache.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
export type NewApiKey = typeof apiKeys.$inferInsert
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
export type SystemPrompt = typeof systemPrompts.$inferSelect
export type NewSystemPrompt = typeof systemPrompts.$inferInsert
