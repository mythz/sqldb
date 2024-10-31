import { Meta, Schema } from "./connection"
import { createSql, Sql } from "./query"
import { Constructor, ConstructorToTypeRef, Driver, Fragment, JoinType, SqlBuilder, TypeRef, WhereOptions } from "./types"
import { sync as db, sql } from '../src/dbSqlite'

type TypeRefs<Tables extends Constructor<any>[]> = {
    [K in keyof Tables]: TypeRef<InstanceType<Tables[K]>>
}

export function from<Table>(table:Constructor<Table>) { 
    const p = db.sql.ref(table)
    const meta = Schema.assertMeta(table)
    return new SelectQuery(db.driver, [table], [meta], [p]) 
}

function example() {
    class A { id?:string }
    class B { name?:string }
    class C { email?:string }

    const q = from(A)
    const withB = q.join(B)
    const ref1 = withB.refs[0]
    const ref2 = withB.refs[1]
    const withBC = withB.join(C)
    const ref3 = withBC.refs[2]
    console.log(ref1.id, ref2.name, ref3.email)
}

function unwrap<T>(cls:Constructor<T>|TypeRef<T>) {
    return typeof cls == 'object' && cls.$ref
        ? cls.$ref.cls
        : cls
}

type LastN<T extends any[], N extends number> = T extends [...any[], ...infer U] 
  ? U['length'] extends N 
    ? U 
    : never 
  : never;

type First<T extends any[]> = T extends [infer L, ...any[]] ? L : never;
type Last<T extends any[]> = T extends [...any[], infer L] ? L : never;


type JoinOptions<NewTable> = { 
    join:JoinType, 
    cls:Constructor<NewTable>,
    on?:string | ((...params:any[]) => Fragment),
    as?:string
    params?:Record<string,any>
}

interface JoinBuilder<NewTable> {
    build(): JoinOptions<NewTable>
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

export class CreateJoin<Tables extends Constructor<any>[]> implements JoinBuilder<First<Tables>> {
    tables:Constructor<any>[]
    refs:TypeRef<any>[]
    params:Record<string,any> = {}
    sql:string =''
    buildOn?:(params:Record<string,any>) => string

    constructor(...tables:any[]) {
        this.tables = tables
        this.refs = this.tables.map(x => sql.ref(x))
    }

    on<JoinTables extends Tables[number][]>(
        expr: (
        ...args: { [K in keyof JoinTables]: InstanceType<JoinTables[K]> }
        ) => Fragment
    ) {
        this.buildOn = (params) => mergeParams(params, expr.call(this, ...this.refs as any))
        return this
    }

    as(alias:string) {
        this.refs[0] = sql.ref(this.tables[0], alias)
        return this
    }

    build(): JoinOptions<First<Tables>> {
        const params:Record<string,any> = {}
        const on = this.buildOn!(params)
        return { join:"JOIN", cls:this.tables[0], as:this.refs[0].$ref.as, on, params }
    }
}

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
    protected _joins:{ join:JoinType, table:string, on?:string }[] = []
    public params:Record<string,any> = {}

    get ref() { return this.refs[0] }
    get meta() { return this.metas[0] }
    get hasWhere() { return this._where.length > 0 }

    refOf<T>(cls:Constructor<T>) : TypeRef<T>|null {
        for (let i=0; i<this.refs.length; i++) {
            const ref = this.refs[i] 
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

    protected createInstance<NewTable>(table: Constructor<NewTable>, meta:Meta, ref:TypeRef<NewTable>) {
        return new WhereQuery(
            this.driver, 
            [...this.tables, table], 
            [...this.metas, meta], 
            [...this.refs, ref] as any
        ) as any as WhereQuery<[...Tables, Constructor<NewTable>]>
    }

    cloneWith<NewTable>(table: Constructor<NewTable>) {
        const ret = this.createInstance<NewTable>(table, Schema.assertMeta(table), this.sql.ref(table))
        ret.params = Object.assign({}, this.params)
        ret._where = Array.from(this._where)
        ret._joins = Array.from(this._joins)
        return ret
    }

    // joinTyped<NewTable>(table: Constructor<NewTable>)//: SelectQuery<[...Tables, Constructor<NewTable>]> 
    // {
    //     const q = this.cloneWith(table)
    //     return q
    // }

    addJoin<NewTable>(join:JoinOptions<NewTable>) {
        const table = Array.isArray(join.cls)
            ? unwrap(join.cls[0])
            : unwrap(join.cls)
        console.log('table', table)
        const q = this.cloneWith<NewTable>(table)
        
        // Fully qualify Table ref if it has no alias
        if (!q.refs[0].$ref.as) {
            q.refs[0] = q.sql.ref(q.meta.cls, q.quoteTable(q.meta.tableName))
        }

        let on = ''
        if (typeof join.on == 'string') {
            on = join.params
                ? q.mergeParams({ sql:join.on, params:join.params })
                : join.on
        } else if (typeof join.on == 'function') {
            const refs = Array.isArray(join.cls)
                ? join.cls.map(unwrap).map(x => q.sql.ref(x)).concat([q.ref])
                : q.refs.slice(-2)
            console.log('refs', refs)
            const sql = Schema.assertSql(join.on.call(q, ...refs))
            on = q.mergeParams(sql)
        }
        q._joins.push({ join:join.join, table:Schema.assertMeta(table).tableName, on })
        return q
    }

    join<NewTable>(cls:Constructor<NewTable>|JoinBuilder<NewTable>, 
        options?:{ 
        on?:(from: InstanceType<Last<Tables>>, to: NewTable, table:InstanceType<First<Tables>>) => Fragment, 
        as?:string 
    }|SqlBuilder) {
        return this.addJoin<NewTable>({ join:"JOIN", cls, on:options?.on, as:options?.as })
    }
    leftJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder<NewTable>, options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin<NewTable>({ join:"LEFT JOIN", cls, on:options?.on, as:options?.as })
    }
    rightJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder<NewTable>, options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin<NewTable>({ join:"RIGHT JOIN", cls, on:options?.on, as:options?.as })
    }
    crossJoin<NewTable>(cls:Constructor<NewTable>|JoinBuilder<NewTable>, options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin<NewTable>({ join:"CROSS JOIN", cls, on:options?.on, as:options?.as })
    }

    on(strings:TemplateStringsArray, ...params:any[]) {
        return this
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
        for (const { join, table, on } of this._joins) {
            const sqlOn = typeof on == 'string'
                ? ` ON ${on}`
                : ''
            sql += ` ${join} ${this.driver.quoteTable(table)}${sqlOn}`
        }
        return sql
    }

    build() {
        const sql = this.buildWhere()
        return { sql, params: this.params }
    }
}

type SelectOptions = {
    props?:string[],
    columns?:string[],
    sql?:Fragment|Fragment[],
}

export class SelectQuery<Tables extends Constructor<any>[]> extends WhereQuery<Tables> {
    protected _select:string[] = []
    protected _skip:number | undefined
    protected _take:number | undefined
    p = new Proxy({}, { get: (target,key) => key })

    protected createInstance<NewTable>(table: Constructor<NewTable>, meta:Meta, ref:TypeRef<NewTable>) {
        return new SelectQuery(
            this.driver, 
            [...this.tables, table], 
            [...this.metas, meta], 
            [...this.refs, ref] as any
        ) as any as SelectQuery<[...Tables, Constructor<NewTable>]>
    }

    cloneWith<NewTable>(table: Constructor<NewTable>) {
        const ret = super.cloneWith<NewTable>(table) as SelectQuery<[...Tables, Constructor<NewTable>]>
        ret._select = Array.from(this._select)
        return ret
    }

    select<T>(options:SelectOptions|TemplateStringsArray|string|Function, ...params:any[]) {
        if (!options && params.length === 0) {
            this._select.length = 0
        } else if (typeof options === 'string') {  
            this._select.push(options)
            if (params.length >= 1) {
                this.addParams(params[0])
            }
        } else if (Array.isArray(options)) {
            this._select.push(this.mergeParams(this.sql(options as TemplateStringsArray, ...params)))
        } else if (typeof options === 'object') {
            const o = options as SelectOptions
            if (o.sql) {
                const sql = Array.isArray(o.sql) ? o.sql : [o.sql]
                for (const fragment of sql) {
                    this._select.push(fragment.sql)
                    this.addParams(fragment.params)
                }
            }
            if (o.props) {
                for (const name of o.props) {
                    const column = this.meta.props.find(x => x.name == name)?.column
                    if (column) {
                        this._select.push(this.quoteColumn(column.name))
                    }
                }
            }
            if (o.columns) {
                for (const name of o.columns) {
                    this._select.push(this.quoteColumn(name))
                }
            }
        } else if (typeof options == 'function') {
            const sql = Schema.assertSql(options.call(this, ...this.refs()))
            this._select.push(this.mergeParams(sql))
        } else throw new Error(`Invalid select(${typeof options})`)
        return this
    }

    get hasSelect() { return this._select.length > 0 }

    skip(rows?:number) {
        this._skip = rows == null ? undefined : rows
        return this
    }
    take(rows?:number) {
        this._take = rows == null ? undefined : rows
        return this
    }
    limit(skip?:number, take?:number) {
        this._skip = skip == null ? undefined : skip
        this._take = take == null ? undefined : take
        return this
    }

    buildSelect() {
        const sqlSelect = this._select.length > 0 
            ? this._select.join(', ') 
            : this.meta.columns.map(x => this.quoteColumn(x.name)).join(', ')
        const sql = `SELECT ${sqlSelect}`
        return sql
    }

    buildFrom() {
        const quotedTable = this.quoteTable(this.meta.tableName)
        let sql = `FROM ${quotedTable}`
        const alias = this.refs[0].$ref.as
        if (alias && alias != quotedTable) {
            sql += ` ${alias}`
        }
        return sql
    }

    buildGroupBy() {
        return ''
    }

    buildHaving() {
        return ''
    }

    buildLimit() {
        const sql = this.driver.sqlLimit(this._skip, this._take)
        return sql
    }

    build() {
        const sql = `${this.buildSelect()} ${this.buildFrom()}${this.buildJoins()}${this.buildWhere()}${this.buildGroupBy()}${this.buildHaving()}`
        return { sql, params:this.params }
    }
}
