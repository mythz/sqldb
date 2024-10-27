import { dbSqlite } from "./dbSqlite"
import { dbPostgres } from "./dbPostgres"
import { sql } from "drizzle-orm"

export function helloSqlite() {
    const query = sql`select "hello world" as text`
    const result = dbSqlite.get<{ text: string }>(query)
    return result
}

export async function helloPostgres() {
    const query = sql`select "hello world" as text`
    const result = await dbPostgres.execute<{ text: string }>(query)
    return result
}

export const one = 1
export const two = 2

export function add(a: number, b: number) {
  return a + b
}