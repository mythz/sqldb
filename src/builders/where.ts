import type { Constructor, ConstructorsToRefs, ConstructorToTypeRef, Driver, First, Fragment, JoinBuilder, JoinDefinition, JoinParams, JoinType, Last, SqlBuilder, TypeRef, TypeRefs, WhereOptions } from "../types"
import { Meta, Schema } from "../connection"
import { createSql, Sql } from "../query"
import { SelectQuery } from "./select"
import { DeleteQuery } from "./delete"
import { UpdateQuery } from "./update"

function joinOptions<NewTable>(type:JoinType, 
    cls:Constructor<NewTable>,
    options?:JoinParams|SqlBuilder) : { 
        type:JoinType, 
        cls:Constructor<NewTable>
        on?:string | ((...params:any[]) => Fragment),
        as?:string
        params?:Record<string,any>
    } {
    if (typeof options == 'object') {
        options = options as JoinParams
        return { type, cls, on:options?.on, as:options?.as, params:options?.params }
    } else if (typeof options == 'function') {
        const builder = options as SqlBuilder
        const { sql, params } = builder.build()
        return { type, cls, on:sql, params }
    } else throw new Error(`Invalid Join Option: ${typeof options}`)
}

function mergeParams(params:Record<string,any>, f:Fragment) {
    let sql = f.sql
    if (f.params && typeof f.params == 'object') {
        for (const [key, value] of Object.entries(f.params)) {
            const exists = key in params && !isNaN(parseInt(key))
            if (exists) {
                const positionalParams = Object.keys(params).map(x => parseInt(x)).filter(x => !isNaN(x))
                const nextParam = positionalParams.length == 0
                    ? 1
                    : Math.max(...positionalParams) + 1
                sql = sql.replaceAll(`$${key}`,`$${nextParam}`)
                params[nextParam] = value
            } else {
                params[key] = value
            }
        }
    }
    return sql
}

export class SqlJoinBuilder<Tables extends Constructor<any>[]> implements JoinBuilder {
    tables: Tables
    refs: ConstructorsToRefs<Tables>

    params:Record<string,any> = {}
    alias:string =''
    buildOn?:(refs:ConstructorsToRefs<Tables>, params:Record<string,any>) => string

    constructor(public driver:Driver, public sql:ReturnType<typeof createSql>, ...tables:Tables) {
        this.tables = tables
        this.refs = this.tables.map(x => sql.ref(x)) as ConstructorsToRefs<Tables>
    }

    on(expr: (...args: ConstructorsToRefs<Tables>) => Fragment) {
        this.buildOn = (refs,params) => mergeParams(params, expr.call(this, ...refs as any))
        return this
    }

    as(alias:string) {
        this.alias = alias
        return this
    }

    build(refs:ConstructorsToRefs<Tables>, type:JoinType) {
        const params:Record<string,any> = {}
        if (this.alias != null) {
            refs[0].$ref.as = this.sql.ref(refs[0].$ref.cls, this.alias)
        }
        const on = this.buildOn!(refs, params)
        return { type, table:this.tables[0].name, as:refs[0].$ref.as, on, params }
    }
}

// Helper type for determining the query class type
type QueryType<T> = 
    T extends SelectQuery<any> ? SelectQuery<any> :
    T extends UpdateQuery<any> ? UpdateQuery<any> :
    T extends DeleteQuery<any> ? DeleteQuery<any> :
    WhereQuery<any>;

// Fixed This type helper
type This<T, NewTables extends Constructor<any>[]> = 
    QueryType<T> extends SelectQuery<any> ? SelectQuery<NewTables> :
    QueryType<T> extends UpdateQuery<any> ? UpdateQuery<NewTables> :
    QueryType<T> extends DeleteQuery<any> ? DeleteQuery<NewTables> :
    WhereQuery<NewTables>;

export class WhereQuery<Tables extends Constructor<any>[]> {
  
    constructor(
        public driver:Driver, 
        public tables: [...Tables], 
        public metas:Meta[], 
        public refs: TypeRefs<Tables>
    ) {
        this.sql = (driver as any).sql ?? createSql(driver)
    }

    sql:ReturnType<typeof createSql>
    protected _where:{ condition:string, sql?:string }[] = []
    protected _joins:JoinDefinition[] = []
    public params:Record<string,any> = {}

    get ref() { return this.refs[0] }
    get meta() { return this.metas[0] }
    get hasWhere() { return this._where.length > 0 }

    refOf<T>(cls:Constructor<T>) : TypeRef<T>|null {
        for (const ref of this.refs) {
            if (cls == ref.$ref.cls) {
                return ref
            }
        }
        return null
    }

    refsOf<T extends readonly Constructor[]>(...classes: [...T]): ConstructorToTypeRef<T> {
        return classes.map(cls => {
            const ret = this.refOf(cls)
            if (ret == null)
                throw new Error(`Could not find ref for '${cls.name}'`)
            return ret
        }) as ConstructorToTypeRef<T>
    }

    prevJoin() {
        return this.refs[this.refs.length - 1]
    }

    createInstance<NewTable extends Constructor<any>>(
        table: NewTable
    ) : This<typeof this, [...Tables, NewTable]> {
        const meta = {} as Meta
        const ref = this.sql.ref(table)
        
        return new (this.constructor as any)(
            this.driver,
            [...this.tables, table],
            [...this.metas, meta],
            [...this.refs, ref]
        );
    }

    copyInto(instance:WhereQuery<any>) {
        instance.params = Object.assign({}, this.params)
        instance._where = Array.from(this._where)
        instance._joins = Array.from(this._joins)
        return instance
    }

    addJoin<NewTable>(join:{ 
        type:JoinType, 
        cls:Constructor<NewTable>
        on?:string | ((...params:any[]) => Fragment),
        as?:string
        params?:Record<string,any>
    }) {
        const table = join.cls as Constructor<NewTable>
        const instance = this.createInstance(table)
        this.copyInto(instance as any)

        let q = instance as WhereQuery<any>

        // Fully qualify Table ref if it has no alias
        if (!q.refs[0].$ref.as) {
            q.refs[0] = q.sql.ref(q.meta.cls, q.quoteTable(q.meta.tableName))
        }

        let on = ''
        const qProtected = q as any
        if (typeof join.on == 'string') {
            on = join.params
                ? qProtected.mergeParams({ sql:join.on, params:join.params })
                : join.on
        } else if (typeof join.on == 'function') {
            const refs = q.refs.slice(-2).concat([q.ref])
            const sql = Schema.assertSql(join.on.call(q, ...refs))
            on = qProtected.mergeParams(sql)
        }
        qProtected._joins.push({ type:join.type, table:Schema.assertMeta(table).tableName, on, params:join.params })
        return instance
    }

    joinBuilder<NewTable>(builder:JoinBuilder, typeHint:JoinType="JOIN") {
        const cls = builder.tables[0] as Constructor<NewTable>
        const q = this.createInstance(cls)
        this.copyInto(q)

        const refs = builder.tables.map(cls => this.refOf(cls) ?? this.sql.ref(cls))
        let { type, table, on, as, params } = builder.build(refs, typeHint)
        if (on && params) {
            on = this.mergeParams({ sql:on, params })
        }
        const qProtected = q as any
        qProtected._joins.push({ type, table, on, as, params })

        return q
    }

    join<NewTable>(cls:Constructor<NewTable>|JoinBuilder, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return (cls as any).tables
            ? this.joinBuilder<NewTable>(cls as JoinBuilder, "JOIN")
            : this.addJoin<NewTable>(joinOptions<NewTable>("JOIN", cls as Constructor<NewTable>, options))
    }
    leftJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return (cls as any).tables
            ? this.joinBuilder<NewTable>(cls as JoinBuilder, "LEFT JOIN")
            : this.addJoin<NewTable>(joinOptions<NewTable>("LEFT JOIN", cls as Constructor<NewTable>, options))
    }
    rightJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return (cls as any).tables
            ? this.joinBuilder<NewTable>(cls as JoinBuilder, "RIGHT JOIN")
            : this.addJoin<NewTable>(joinOptions<NewTable>("RIGHT JOIN", cls as Constructor<NewTable>, options))
    }
    fullJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return (cls as any).tables
            ? this.joinBuilder<NewTable>(cls as JoinBuilder, "FULL JOIN")
            : this.addJoin<NewTable>(joinOptions<NewTable>("FULL JOIN", cls as Constructor<NewTable>, options))
    }
    crossJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return (cls as any).tables
            ? this.joinBuilder<NewTable>(cls as JoinBuilder, "CROSS JOIN")
            : this.addJoin<NewTable>(joinOptions<NewTable>("CROSS JOIN", cls as Constructor<NewTable>, options))
    }

    where(options:WhereOptions|TemplateStringsArray|Function, ...params:any[]) { 
        return this.and(options, ...params)
    }

    and(options:WhereOptions|TemplateStringsArray|Function, ...params:any[]) {
        if (!options && params.length == 0) {
            this._where.length = 0
            return this
        } else if (Array.isArray(options)) {
            return this.condition('AND', { sql: this.sql(options as TemplateStringsArray, ...params) }) 
        } else if (typeof options == 'function') {
            const sql = Schema.assertSql(options.call(this, ...this.refs))
            return this.condition('AND', { sql })
        } else {
            return this.condition('AND', options as WhereOptions) 
        }
    }

    or(options:WhereOptions|TemplateStringsArray|Function, ...params:any[]) { 
        if (!options && params.length == 0) {
            this._where.length = 0
        } else if (Array.isArray(options)) {
            return this.condition('OR', { sql: this.sql(options as TemplateStringsArray, ...params) }) 
        } else if (typeof options == 'function') {
        } else {
            return this.condition('OR', options as WhereOptions) 
        }
    }

    condition(condition:"AND"|"OR", options:WhereOptions) {
        if (options.sql) {
            const sql = Array.isArray(options.sql) ? options.sql : [options.sql]
            for (const fragment of sql) {
                this._where.push({ condition:condition, sql:this.mergeParams(fragment) })
            }
        }
        if (options.rawSql) {
            const sql = Array.isArray(options.rawSql) ? options.rawSql : [options.rawSql]
            for (const fragment of sql) {
                this._where.push({ condition, sql:fragment })
            }
            this.addParams(options.params)
        }
        for (const [op, values] of Object.entries(options)) {
            if (Sql.opKeys.includes(op)) {
                this.addWhere(condition, Sql.ops[op], values)
            } else if (op === 'op' && Array.isArray(values) && values.length >= 2) {
                const [ sqlOp, params ] = values
                this.addWhere(condition, sqlOp, params)
            }
        }
        return this
    }

    quote(symbol:string) { return this.driver.quote(symbol) }
    quoteTable(table:string) { return this.driver.quoteTable(table) }
    
    quoteColumn(column:string) { 
        const as = this.ref.$ref.as
        const prefix = as ? as + '.' : ''
        return prefix + this.driver.quoteColumn(column) 
    }

    alias(alias?:string) {
        this.refs[0] = this.sql.ref(this.refs[0].$ref.cls, alias)
        return this
    }

    protected addParams(params?:Record<string,any>) {
        if (params && typeof params == 'object') {
            for (const [key, value] of Object.entries(params)) {
                this.params[key] = value
            }
        }
    }

    protected mergeParams(f:Fragment) {
        let sql = f.sql
        if (f.params && typeof f.params == 'object') {
            for (const [key, value] of Object.entries(f.params)) {
                const exists = key in this.params && !isNaN(parseInt(key))
                if (exists) {
                    const positionalParams = Object.keys(this.params).map(x => parseInt(x)).filter(x => !isNaN(x))
                    const nextParam = positionalParams.length == 0
                        ? 1
                        : Math.max(...positionalParams) + 1
                    sql = sql.replaceAll(`$${key}`,`$${nextParam}`)
                    this.params[nextParam] = value
                } else {
                    this.params[key] = value
                }
            }
        }
        return sql
    }

    private addWhere(condition:string, sqlOp:string, values:any) {
        if (!condition) throw new Error('condition is required')
        if (!sqlOp) throw new Error('sqlOp is required')
        if (!values) throw new Error('values is required')
        for (const [key, value] of Object.entries(values)) {
            const prop = this.meta.props.find(x => x.name === key)
            if (!prop) throw new Error(`Property ${key} not found in ${this.meta.name}`)
            if (!prop.column) throw new Error(`Property ${key} is not a column`)
            this._where.push({ condition, sql:`${this.driver.quoteColumn(prop.column.name)} ${sqlOp} $${prop.name}`})
            this.params[prop.name] = value
        }
    }

    buildWhere() {
        if (this._where.length === 0) return ''
        let sb = ' WHERE '
        for (const [i, { condition, sql }] of this._where.entries()) {
            if (i > 0) sb += ` ${condition} `
            sb += sql
        }
        return sb
    }

    buildJoins() {
        if (this._joins.length == 0) return ''
        let sql = ''
        for (const { type, table, as, on } of this._joins) {
            const quotedTable = this.driver.quoteTable(table)
            const sqlAs = as && as !== quotedTable
                ? ` ${as}`
                : ''
            const sqlOn = typeof on == 'string'
                ? ` ON ${on}`
                : ''
            sql += ` ${type ?? 'JOIN'} ${quotedTable}${sqlAs}${sqlOn}`
        }
        return sql
    }

    build() {
        const sql = this.buildWhere()
        return { sql, params: this.params }
    }
}
