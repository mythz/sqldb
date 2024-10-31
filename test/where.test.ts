import { describe, it, expect } from 'bun:test'
import type { SqlBuilder } from '../src/types'
import { Contact, DynamicPerson, Freight, Order, OrderItem, Person } from './data'
import { sync as db, sql, $ } from '../src/dbSqlite'
import { selectContact, selectPerson, str } from './utils'

describe('SQLite WHERE Tests', () => {


    it (`Can query single Contact`, () => {
        const id = 1
        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectContact} FROM "Contact" WHERE "id" = $id`)
            expect(params.id).toBe(id)
        }

        assert(db.from(Contact).where({ eq:  { id } }))
        assert(db.from(Contact).where({ '=': { id } }))
        assert(db.from(Contact).where({ op:  ['=',{ id }] }))
        assert(db.from(Contact).where({ sql: db.sql('"id" = $id', { id }) }))
        assert(db.from(Contact).where({ sql: sql('"id" = $id', { id }) }))
        assert(db.from(Contact).where({ sql: { sql:'"id" = $id', params:{ id } } }))
    })

    it (`Can query single Person alias`, () => {
        const key = 1
        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectPerson} FROM "Contact" WHERE "id" = $key`)
            expect(params.key).toBe(key)
        }

        assert(db.from(Person).where({ eq:  { key } }))
        assert(db.from(Person).where({ '=': { key } }))
        assert(db.from(Person).where({ op:  ['=',{ key }] }))
        assert(db.from(Person).where({ sql: db.sql('"id" = $key', { key }) }))
        assert(db.from(Person).where({ sql: sql('"id" = $key', { key }) }))
        assert(db.from(Person).where({ sql: { sql:'"id" = $key', params:{ key } } }))

        expect(str(db.from(Person).where((p:Person) => sql`${p.key} = ${key}`)))
            .toBe(`SELECT ${selectPerson} FROM "Contact" WHERE "id" = $1`)
        // const p = sql.ref(Person,'p')
        // db.from(Person).where`${p.key} = ${key}`
    })

    it (`Can query single DynamicPerson alias`, () => {
        const key = 1
        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectPerson} FROM "Contact" WHERE "id" = $key`)
            expect(params.key).toBe(key)
        }

        assert(db.from(DynamicPerson).where({ eq:  { key } }))
        assert(db.from(DynamicPerson).where({ '=': { key } }))
        assert(db.from(DynamicPerson).where({ op:  ['=',{ key }] }))
        assert(db.from(DynamicPerson).where({ sql: db.sql('"id" = $key', { key }) }))
        assert(db.from(DynamicPerson).where({ sql: sql('"id" = $key', { key }) }))
        assert(db.from(DynamicPerson).where({ sql: { sql:'"id" = $key', params:{ key } } }))
    })

    it (`Can query single Contact with multiple params`, () => {
        const id = 1
        const city = 'Austin'

        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectContact} FROM "Contact" WHERE "id" = $id AND "city" = $city`)
            expect(params.id).toBe(id)
        }

        assert(db.from(Contact).where({ eq:  { id, city } }))
        assert(db.from(Contact).where({ '=': { id, city } }))
        assert(db.from(Contact).where({ op:  ['=',{ id, city }] }))
        assert(db.from(Contact).where({ sql: db.sql('"id" = $id AND "city" = $city', { id, city }) }))
        assert(db.from(Contact).where({ sql: sql('"id" = $id AND "city" = $city', { id, city }) }))
        assert(db.from(Contact).where({ sql: [ sql('"id" = $id', { id }), sql('"city" = $city', { city }) ] }))

        assert(db.from(Contact).where({ sql: sql('"id" = $id AND "city" = $city', { id, city }) }))
    })

    it (`Can query single Person alias with multiple params`, () => {
        const key = 1
        const name = 'John'

        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectPerson} FROM "Contact" WHERE "id" = $key AND "firstName" = $name`)
            expect(params.key).toBe(key)
        }

        assert(db.from(Person).where({ eq:  { key, name } }))
        assert(db.from(Person).where({ '=': { key, name } }))
        assert(db.from(Person).where({ op:  ['=',{ key, name }] }))
        assert(db.from(Person).where({ sql: db.sql('"id" = $key AND "firstName" = $name', { key, name }) }))
        assert(db.from(Person).where({ sql: sql('"id" = $key AND "firstName" = $name', { key, name }) }))
        assert(db.from(Person).where({ sql: [ sql('"id" = $key', { key }), sql('"firstName" = $name', { name }) ] }))
        assert(db.from(Person).where({ sql: sql('"id" = $key AND "firstName" = $name', { key, name }) }))
    })

    it (`Can query single Contact with tagged template`, () => {
        const id = 1
        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectContact} FROM "Contact" WHERE "id" = $1`)
            expect(params['1']).toBe(id)
        }

        const { sql } = db
        assert(db.from(Contact).where`"id" = ${id}`)
        assert(db.from(Contact).where({ sql: sql`"id" = ${id}` }))
    })

})
