import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
export const cards = sqliteTable('cards', { id:text('id').primaryKey(), content:text('content').notNull(), active:integer('active').notNull().default(1), updatedAt:text('updated_at').notNull() });
export const learning = sqliteTable('learning', { id:text('id').primaryKey(), cardId:text('card_id').notNull(), date:text('date').notNull(), evidence:text('evidence').notNull(), status:text('status').notNull(), createdAt:text('created_at').notNull() });
export const progress = sqliteTable('progress', { scope:text('scope').notNull(), cardId:text('card_id').notNull(), state:text('state').notNull() },t=>[primaryKey({columns:[t.scope,t.cardId]})]);
export const sessions = sqliteTable('sessions', { scope:text('scope').primaryKey(), revision:integer('revision').notNull().default(0), state:text('state').notNull() });
export const events = sqliteTable('events', { id:text('id').primaryKey(), scope:text('scope').notNull(), cardId:text('card_id'), kind:text('kind').notNull(), data:text('data').notNull(), createdAt:text('created_at').notNull() });
export const settings = sqliteTable('settings', { key:text('key').primaryKey(), value:text('value').notNull() });
export const syncRuns = sqliteTable('sync_runs', { id:text('id').primaryKey(), createdAt:text('created_at').notNull(), summary:text('summary').notNull() });
export const sourceAssets = sqliteTable('source_assets', { key:text('key').primaryKey(), base64:text('base64').notNull(), contentType:text('content_type').notNull() });
