import { describe, it, expect } from 'bun:test'
import { Contact, DynamicPerson, Freight, Order, OrderItem, Person } from './data'
import { sync as db, sql, $ } from '../src/dbSqlite'
import { SqlBuilder } from '../src/types'

const selectContact = 'id,firstName,lastName,email,phone,address,city,state,postCode,createdAt,updatedAt'
    .split(',').map(c => `"${c}"`).join(', ')

const selectPerson = 'id,firstName,lastName,email'
    .split(',').map(c => `"${c}"`).join(', ')

function str(q:SqlBuilder) {
    const { sql } = q.build()
    return sql
}

describe('SQLite Typed SelectQuery Tests', () => {

    it ('Can join multiple tables', () => {
        let q1 = db.from(Contact).alias('c')
        let q2 = q1.join(Order, { on:(c, o) => $`${c.id} = ${o.contactId}` })
        let q3 = q2.join(OrderItem, { on:(o:Order, i:OrderItem, c:Contact) => $`${o.id} = ${i.orderId}` })
        
        expect(str(db.from(Contact).alias('c').join(Order, { on:(c, o) => $`${c.id} = ${o.contactId}` })))
            .toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`)

        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c:Contact, o:Order) => $`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o:Order, i:OrderItem) => $`${o.id} = ${i.orderId}` })
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId" JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"`)
        
        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c, o) => $`${c.id} = ${o.contactId}` })
            .join(OrderItem, { on:(o, i) => $`${o.id} = ${i.orderId}` })
            .leftJoin(sql.join(Freight,Order).on((f, o) => $`${o.freightId} = ${f.id}`))
            .select('*')
        )).toContain('FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"' 
            + ' JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"' 
            + ' LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"')

        expect(str(db.from(Contact).alias('c')
            .join(Order, { on:(c, o) => $`${c.id} = ${o.contactId}` })
            .join(sql.join(OrderItem,Order,Freight).as('i')
                .on((i, o, f) => $`${o.id} = ${i.orderId} LEFT JOIN ${f} ON ${o.freightId} = ${f.id}`))
            .select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`
            + ' JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"'
            + ' LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"'
        )
        expect(str(db.from(Contact).alias('c')
            .join(sql.join(Order,OrderItem,Freight,Contact)
                .on((o, i, f, c) => $`${c.id} = ${o.contactId} JOIN ${i} ON ${o.id} = ${i.orderId} LEFT JOIN ${f} ON ${o.freightId} = ${f.id}`))
            .select('*')
        )).toContain(`FROM "Contact" c JOIN "Order" ON c."id" = "Order"."contactId"`
            + ' JOIN "OrderItem" ON "Order"."id" = "OrderItem"."orderId"'
            + ' LEFT JOIN "Freight" ON "Order"."freightId" = "Freight"."id"'
        )
    })

})

