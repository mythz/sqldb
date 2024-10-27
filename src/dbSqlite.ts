import { drizzle } from "drizzle-orm/bun-sqlite"
import { Database } from "bun:sqlite"

const sqlite = new Database("app.db")
export const dbSqlite = drizzle(sqlite)