import { describe, it, expect } from 'bun:test'
import { Contact, DynamicPerson, Order, Person } from './data'
import { sync as db, sql } from '../src/dbSqlite'
import { SqlBuilder } from '../src/types'

const selectContact = 'id,firstName,lastName,email,phone,address,city,state,postCode,createdAt,updatedAt'
    .split(',').map(c => `"${c}"`).join(', ')

const selectPerson = 'id,firstName,lastName,email'
    .split(',').map(c => `"${c}"`).join(', ')

function str(q:SqlBuilder) {
    const { sql } = q.build()
    return sql
}

describe.only('SQLite SelectQuery Tests', () => {

    it (`Can select custom fields from Contact`, () => {
        expect(str(db.from(Contact).select('*'))).toContain('*')
        expect(str(db.from(Contact).select('id,city'))).toContain('id,city')
        expect(str(db.from(Contact).select`id,city`)).toContain('id,city')
        expect(str(db.from(Contact).select({
            columns: ['id', 'city']
        }))).toContain('"id", "city"')
        expect(str(db.from(Contact).select({
            sql: sql('id,city')
        }))).toContain('id,city')
        expect(str(db.from(Contact).select({
            sql: [sql('id'),sql('city')]
        }))).toContain('id, city')
        expect(str(db.from(Contact).select({
            columns: ['id', 'city']
        }))).toContain('"id", "city"')
        expect(str(db.from(Contact).select({
            props: ['id', 'city']
        }))).toContain('"id", "city"')
        expect(str(db.from(Contact).select(
            (c:Contact) => [c.id, c.city])
        )).toContain('"id", "city"')
        expect(str(db.from(Contact).select(
            (c:Contact,p:Person) => [c.id, c.city, sql.column(Person,p.surname)])
        )).toContain('"id", "city", "lastName"')
        expect(str(db.from(Contact).alias('c').select(
            (c:Contact) => [c.id, c.city])
        )).toContain('c."id", c."city"')
    })

    it (`Can select custom fields from Person`, () => {
        expect(str(db.from(Person).select('*'))).toContain('*')
        expect(str(db.from(Person).select('id,email'))).toContain('id,email')
        expect(str(db.from(Person).select`id,email`)).toContain('id,email')
        expect(str(db.from(Person).select({
            columns: ['id', 'email']
        }))).toContain('"id", "email"')
        expect(str(db.from(Person).select({
            sql: sql('id,email')
        }))).toContain('id,email')
        expect(str(db.from(Person).select({
            sql: [sql('id'),sql('email')]
        }))).toContain('id, email')
        expect(str(db.from(Person).select({
            columns: ['id', 'email']
        }))).toContain('"id", "email"')
        expect(str(db.from(Person).select({
            props: ['key', 'name']
        }))).toContain('"id", "firstName"')
        expect(str(db.from(Person).select(
            (c:Person) => [c.key, c.name])
        )).toContain('"id", "firstName"')
        expect(str(db.from(Person).select(
            (p:Person,c:Contact) => [p.key, p.name, sql.column(Contact,c.city!)])
        )).toContain('"id", "firstName", "city"')
        expect(str(db.from(Person).alias('p').select(
            (p:Person) => [p.key, p.name])
        )).toContain('p."id", p."firstName"')
    })

    it (`Can select custom fields from DynamicPerson`, () => {
        expect(str(db.from(DynamicPerson).select('*'))).toContain('*')
        expect(str(db.from(DynamicPerson).select('id,email'))).toContain('id,email')
        expect(str(db.from(DynamicPerson).select`id,email`)).toContain('id,email')
        expect(str(db.from(DynamicPerson).select({
            columns: ['id', 'email']
        }))).toContain('"id", "email"')
        expect(str(db.from(DynamicPerson).select({
            sql: sql('id,email')
        }))).toContain('id,email')
        expect(str(db.from(DynamicPerson).select({
            sql: [sql('id'),sql('email')]
        }))).toContain('id, email')
        expect(str(db.from(DynamicPerson).select({
            columns: ['id', 'email']
        }))).toContain('"id", "email"')
        expect(str(db.from(DynamicPerson).select({
            props: ['key', 'name']
        }))).toContain('"id", "firstName"')
        expect(str(db.from(DynamicPerson).select(
            (c:DynamicPerson) => [c.key, c.name])
        )).toContain('"id", "firstName"')
        expect(str(db.from(DynamicPerson).select(
            (p:DynamicPerson,c:Contact) => [p.key, p.name, sql.column(Contact,c.city!)])
        )).toContain('"id", "firstName", "city"')
        expect(str(db.from(Person).alias('p').select(
            (p:DynamicPerson) => [p.key, p.name])
        )).toContain('p."id", p."firstName"')
    })

    it ('Can join multiple tables', () => {
        expect(str(db.from(Contact).alias('c').join(Order, { on:(c:Contact,o:Order) => `${c.id} = ${o.contactId}` })))
            .toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`)
    })

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
