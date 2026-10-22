import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// The whole gamestate is stored as JSON; status is a column so the lobby can filter on it.
export const gamestate = sqliteTable('gamestate', {
	id: text('id').primaryKey(),
	gameStatus: text('game_status').notNull(),
	state: text('state', { mode: 'json' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull()
});

export const password = sqliteTable('password', {
	id: text('id').primaryKey(),
	passwordHash: text('password_hash').notNull()
});
