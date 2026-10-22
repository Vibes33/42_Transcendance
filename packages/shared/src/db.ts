import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Ouvre la base SQLite d'un service (un fichier par service), en mode WAL pour supporter
 * plusieurs lectures pendant une écriture, puis applique les migrations Drizzle.
 */
export function openDatabase<S extends Record<string, unknown>>(opts: { file: string; schema: S; migrations: string }) {
  if (opts.file !== ":memory:") mkdirSync(dirname(opts.file), { recursive: true });
  const sqlite = new Database(opts.file, { create: true });
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA busy_timeout = 5000;");
  sqlite.exec("PRAGMA foreign_keys = ON;");
  const db = drizzle(sqlite, { schema: opts.schema });
  migrate(db, { migrationsFolder: opts.migrations });
  return { db, sqlite };
}
