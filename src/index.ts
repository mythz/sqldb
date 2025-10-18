import dbSqlite, { driver, sync, $ } from "./dbSqlite"
import { Connection, ConnectionBase, SyncConnection } from "./connection"
import pgSql from "./dbPostgres"
import { WhereQuery } from "./builders/where"
import { SelectQuery } from "./builders/select"
import { DeleteQuery } from "./builders/delete"
import { createSql } from "./query"

export function helloSqlite() {
    const result = dbSqlite.sync.scalar`select "hello world" as text`
    return result
}

export async function helloPostgres() {
    const result = await pgSql.unsafe(`select 'hello world' as text`)
    return result[0].text
}

export const one = 1
export const two = 2

export function add(a: number, b: number) {
  return a + b
}

export { 
  driver, 
  sync, 
  $,
  createSql,
  ConnectionBase,
  SyncConnection,
  Connection,
  WhereQuery,
  SelectQuery,
  DeleteQuery,
}
