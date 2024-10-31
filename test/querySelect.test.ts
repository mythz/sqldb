import { describe, it, expect } from 'bun:test'
import { Contact, DynamicPerson, Freight, Order, OrderItem, Person } from './data'
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
            //console.log('from', q.buildFrom(), 'joins', q.buildJoins())
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

    it ('Does return correct refs', () => {
        var q = db.from(Order), 
            o = q.ref()

        expect(o.$ref.cls).toBe(Order)

        q = q.join(Contact, { 
            on:(o:Order, c:Contact) => sql`${o.contactId} = ${c.id}` 
        })

        expect(q.ref().$ref.cls).toBe(Order)
        expect(q.refOf(Order)!.$ref.cls).toBe(Order)
        expect(q.refOf(Contact)!.$ref.cls).toBe(Contact)

        var [o, c] = q.refsOf(Order,Contact)

        expect(o.$ref.cls).toBe(Order)
        expect(c.$ref.cls).toBe(Contact)

        var [c, o] = q.refsOf(Contact,Order)

        expect(o.$ref.cls).toBe(Order)
        expect(c.$ref.cls).toBe(Contact)

        expect(q.refOf(Freight)).toBeNull()

        expect(() => q.refsOf(Freight,Contact,Order)).toThrow("Could not find ref for 'Freight'")
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

    it ('Does merge params', () => {
        const id = 1
        const city = 'Austin'

        function assert(q:SqlBuilder) {
            const { sql, params } = q.build()
            expect(sql).toBe(`SELECT ${selectContact} FROM "Contact" WHERE a = $1 AND city = $2`)
            expect(params).toEqual({ '1':id, '2':city })
        }

        assert(db.from(Contact).where`a = ${id}`.and`city = ${city}`)
        assert(db.from(Contact).where( { sql:[sql`a = ${id}`, sql`city = ${city}`] }))
        assert(db.from(Contact).where( { sql:sql`a = ${id}` }).and({ sql:sql`city = ${city}` }))
        assert(db.from(Contact).where( { rawSql:`a = $1 AND city = $2`, params: { [1]:id, [2]:city }  }))
    })

    it ('Can join multiple tables', () => {
        expect(str(db.from(Contact).alias('c').join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })))
            .toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`)
        
        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => sql`${o.id} = ${i.orderId}` })))
            .toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId" JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"`)
        
        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => sql`${o.id} = ${i.orderId}` })
            .leftJoin([Freight,Order], { on:(f:Freight, o:Order, c:Contact) => sql`${o.freightId} = ${f.id}` })
            .select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId" JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId" LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"`)
        
        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join([OrderItem,Order,Freight], { 
                on:(i:OrderItem, o:Order, f:Freight, c:Contact) => sql`${o.id} = ${i.orderId} LEFT JOIN ${f} ON ${o.freightId} = ${f.id}` 
            })
            .select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`
            + ' JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"'
            + ' LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"'
        )
        expect(str(db.from(Contact).alias('c')
            .join([Order,OrderItem,Freight], { 
                on:(o:Order, i:OrderItem, f:Freight, c:Contact) => sql`${c.id} = ${o.contactId} JOIN ${i} ON ${o.id} = ${i.orderId} LEFT JOIN ${f} ON ${o.freightId} = ${f.id}` 
            })
            .select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`
            + ' JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"'
            + ' LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"'
        )
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
