import { describe, it, expect } from 'bun:test'
import type { SqlBuilder } from '../src/types'
import { Contact, DynamicPerson, Freight, Order, OrderItem, Person } from './data'
import { sync as db, sql, $ } from '../src/dbSqlite'
import { selectContact, selectPerson, str } from './utils'

describe('SQLite SelectQuery Tests', () => {

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
            (c:Contact) => sql`${c.id}, ${c.city}`)
        )).toContain('"id", "city"')
        const p = sql.ref(Person,'')
        expect(str(db.from(Contact).select(
            (c:Contact) => sql`${c.id}, ${c.city}, ${p.surname}`)
        )).toContain('"id", "city", "lastName"')
        expect(str(db.from(Contact).alias('c').select(
            (c:Contact) => sql`${c.id}, ${c.city}`)
        )).toContain('c."id", c."city"')
    })

    it ('Can select multiple joined tables', () => {

        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => sql`${o.id} = ${i.orderId}` })
            .leftJoin(sql.join(Freight,Order).on((f, o) => $`${o.freightId} = ${f.id}`))
            .select((c, o, i, f) => $`${c.firstName}, ${o.contactId}, ${i.orderId}, ${f.name}`)))
        .toContain("FROM")
        
    })

    it (`Can select custom fields from Person`, () => {
        expect(str(db.from(Person).select('*'))).toContain('*')
        expect(str(db.from(Person).select('id,email'))).toContain('id,email')
        expect(str(db.from(Person).select`id,email`)).toContain('id,email')
        expect(str(db.from(Person).select({
            columns: ['id','email']
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
            (c:Person) => sql`${c.key}, ${c.name}`)
        )).toContain('"id", "firstName"')
        
        const c = sql.ref(Contact,'')
        expect(str(db.from(Person).select(
            (p:Person) => sql`${p.key}, ${p.name}, ${c.city}`)
        )).toContain('"id", "firstName", "city"')
        expect(str(db.from(Person).alias('p').select(
            (p:Person) => sql`${p.key}, ${p.name}`)
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
            (c:DynamicPerson) => sql`${c.key}, ${c.name}`)
        )).toContain('"id", "firstName"')

        const c = sql.ref(Contact,'')
        expect(str(db.from(DynamicPerson).select(
            (p:DynamicPerson) => sql`${p.key}, ${p.name}, ${c.city}`)
        )).toContain('"id", "firstName", "city"')
        expect(str(db.from(Person).alias('p').select(
            (p:DynamicPerson) => sql`${p.key}, ${p.name}`)
        )).toContain('p."id", p."firstName"')
    })

    it ('Can select columns with variables', () => {
        function assert(q:SqlBuilder, sqlContains:string, expectedParams:any) {
            const { sql, params } = q.build()
            expect(sql).toContain(sqlContains)
            expect(params).toEqual(expectedParams)
        }

        assert(db.from(Order).select((o:Order) => sql`COUNT(${o.qty}) as count`), 
            `COUNT("qty") as count`, {})
        
        const contactId = 1
        const freightId = 2
        const multiplier = 3
        assert(db.from(Order).select((o:Order) => sql`COUNT(${o.qty}) * ${multiplier} as count`), 
            `COUNT("qty") * $1 as count`, { [1]:multiplier })

        assert(db.from(Order)
            .where((o:Order) => sql`${o.freightId} = ${freightId}`)
            .and((o:Order) => sql`${o.contactId} = ${contactId}`)
            .select((o:Order) => sql`COUNT(${o.qty}) * ${multiplier} as count`), 
            `SELECT COUNT(\"qty\") * $3 as count FROM \"Order\" WHERE \"freightId\" = $1 AND \"contactId\" = $2`, 
            { [1]:freightId, [2]:contactId, [3]:multiplier })

        assert(db.from(Order)
            .join(Contact, { 
                on:(o:Order, c:Contact) => sql`${o.contactId} = ${c.id} AND ${c.id} = ${contactId}` 
            })
            .where((o:Order) => sql`${o.freightId} = ${freightId}`)
            .select((o:Order) => sql`COUNT(${o.qty}) * ${multiplier} as count`), 
            `SELECT COUNT("Order"."qty") * $3 as count FROM "Order" JOIN "Contact" ON "Order"."contactId" = "Contact"."id" AND "Contact"."id" = $1 WHERE "Order"."freightId" = $2`, 
            { [1]:contactId, [2]:freightId, [3]:multiplier })
    })

    it ('Can query with just refs', () => {
        function assert(q:SqlBuilder, sqlContains:string, expectedParams:any) {
            const { sql, params } = q.build()
            expect(sql).toContain(sqlContains)
            expect(params).toEqual(expectedParams)
        }

        const contactId = 1
        const freightId = 2
        const multiplier = 3

        ;((expectedSql, expectedParams) => {
            
            var q = db.from(Order)
            var [o, c] = sql.refs(Order,Contact)

            q = q.join(Contact, { 
                on:() => sql`${o.contactId} = ${c.id}` 
            })

            var [o,c] = q.refsOf(Order,Contact)

            assert(q
                .where(() => sql`${c.id} = ${contactId} AND ${o.freightId} = ${freightId}`)
                .select(() => sql`COUNT(${o.qty}) * ${multiplier} as count`),
                expectedSql, expectedParams)

            var q = db.from(Order)
            var [o, c] = sql.refs(Order,Contact)
    
            assert(q
                //.join(c).on`${o.contactId} = ${c.id}`
                .join(Contact, { 
                    on:() => sql`${o.contactId} = ${c.id}` 
                })
                .where`${c.id} = ${contactId} AND ${o.freightId} = ${freightId}`
                .select`COUNT(${o.qty}) * ${multiplier} as count`,
                expectedSql, expectedParams)

            let s = `
            SELECT COUNT("Order"."qty") * $1 as count FROM "Order" 
             JOIN "Contact" ON "Order"."contactId" = "Contact"."id"
             WHERE "Contact"."id" = $1 AND "Order"."freightId" = $2            
            `
        })(
            'SELECT COUNT("Order"."qty") * $3 as count FROM "Order"' 
            + ' JOIN "Contact" ON "Order"."contactId" = "Contact"."id"' 
            + ' WHERE "Contact"."id" = $1 AND "Order"."freightId" = $2',
            { [1]:contactId, [2]:freightId, [3]:multiplier }
        )

        assert(db.from(Order)
            .join(Contact, { 
                on:(o:Order, c:Contact) => sql`${o.contactId} = ${c.id} AND ${c.id} = ${contactId}` 
            })
            .where((o:Order) => sql`${o.freightId} = ${freightId}`)
            .select((o:Order) => sql`COUNT(${o.qty}) * ${multiplier} as count`), 
            `SELECT COUNT("Order"."qty") * $3 as count FROM "Order" JOIN "Contact" ON "Order"."contactId" = "Contact"."id" AND "Contact"."id" = $1 WHERE "Order"."freightId" = $2`, 
            { [1]:contactId, [2]:freightId, [3]:multiplier })
    })
})
