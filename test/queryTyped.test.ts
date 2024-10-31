import { describe, it, expect } from 'bun:test'
import { Contact, DynamicPerson, Freight, Order, OrderItem, Person } from './data'
import { sync as db, sql } from '../src/dbSqlite'
import { Fragment, SqlBuilder } from '../src/types'
import { Schema } from '../src/connection'
import { from } from '../src/queryTyped'

const selectContact = 'id,firstName,lastName,email,phone,address,city,state,postCode,createdAt,updatedAt'
    .split(',').map(c => `"${c}"`).join(', ')

const selectPerson = 'id,firstName,lastName,email'
    .split(',').map(c => `"${c}"`).join(', ')

function str(q:SqlBuilder) {
    const { sql } = q.build()
    return sql
}

describe.only('SQLite Typed SelectQuery Tests', () => {

    it ('Can join multiple tables', () => {
        expect(str(db.from(Contact).alias('c').join(Order, { on:(c, o) => sql`${c.id} = ${o.contactId}` })))
            .toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`)

        let q1 = from(Contact).alias('c')
        let q2 = q1.join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
        let q3 = q2.join(OrderItem, { on:(o:Order, i:OrderItem, c) => sql`${o.id} = ${i.orderId}` })

        expect(str(from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => sql`${o.id} = ${i.orderId}` })
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId" JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"`)
        
        expect(str(from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => sql`${o.id} = ${i.orderId}` })
            .leftJoin([Freight,Order], { on:(f:Freight, o:Order, c:Contact) => sql`${o.freightId} = ${f.id}` })
            //.select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId" JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId" LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"`)

        const j = sql.join(OrderItem,Order,Freight)
            .on((i:OrderItem, o:Order, f:Freight) => sql`${o.id} = ${i.orderId} LEFT JOIN ${f} ON ${o.freightId} = ${f.id}`)

        expect(str(from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => sql`${c.id} = ${o.contactId}` })
            .join(j)
            )
            //.select('*')
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

})

