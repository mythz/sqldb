import type { Constructor, ConstructorToTypeRef, Driver, Fragment, TypeRef } from "./types"
import { Meta, Schema } from "./connection"
import { SqlJoinBuilder } from "./builders/where"

export class Sql
{
    static ops:{[key:string]:string} = {
        eq:      '=',
        '=':     '=',
        notEq:   '<>',
        '!=':    '!=',
        gt:      '>',
        '>':     '>',
        gte:     '>=',
        '>=':    '>=',
        lt:      '<',
        '<':     '<',
        lte:     '<=',
        '<=':    '<=',
        like:    'LIKE',
        notLike: 'NOT LIKE',
        in:      'IN',
        notIn:   'NOT IN',
        isNull:  'IS NULL',
        notNull: 'IS NOT NULL',
    }

    static opKeys = Object.keys(Sql.ops)
}

export function createSql(driver:Driver) {
    function sql(strings: TemplateStringsArray|string, ...params: any[]) : Fragment {
        if (Array.isArray(strings)) {
            let sb = ''
            const sqlParams:Record<string,any> = {}
            for (let i = 0; i < strings.length; i++) {
                sb += strings[i]
                if (i >= params.length) continue
                const value = params[i]
                if (typeof value == 'symbol') {
                    // include symbol literal as-is
                    sb += value.description ?? ''
                } else if (typeof value == 'object' && value.$ref) {
                    // if referencing proxy itself, return its quoted tableName
                    sb += driver.quoteTable(Schema.assertMeta(value.$ref.cls).tableName)
                } else if (value) {
                    const paramIndex = Object.keys(sqlParams).length + 1
                    const name = `${paramIndex}`
                    sb += `$${name}`
                    sqlParams[name] = value
                }
            }
            return ({ sql:sb, params:sqlParams })
        } else if (typeof strings === 'string') {
            return ({ sql:strings, params:params[0] })
        } else throw new Error(`sql(${typeof strings}) is invalid`)
    }

    function quote(meta:Meta, prop:string) {
        const p = meta.props.find(x => x.name == prop)?.column
        if (!p) throw new Error(`${meta.name} does not have a column property ${prop}`)
        return driver.quoteColumn(p.name)
    }
    sql.ref = function<T>(cls:Constructor<T>, as?:string) : TypeRef<T> {
        const meta = Schema.assertMeta(cls)
        if (as == null)
            as = driver.quoteTable(meta.tableName)
        const get = (target: { prefix:string, meta:Meta }, key:string|symbol) => key == '$ref' 
            ? { cls, as }
            : Symbol(target.prefix + quote(meta, typeof key == 'string' ? key : key.description!))
        const p = new Proxy({ prefix: as ? as + '.' : '', meta }, { get })
        return p as any as TypeRef<T>
    }
    sql.refs = function refs<T extends readonly Constructor[]>(...classes: [...T]): ConstructorToTypeRef<T> {
        return classes.map(cls => sql.ref(cls)) as ConstructorToTypeRef<T>
    }
    sql.join = function<JoinTables extends Constructor<any>[]>(...joinTables:JoinTables) {
        return new SqlJoinBuilder<JoinTables>(driver, sql, ...joinTables)
    }

    return sql
}
/*
export type Join = {
    join:  JoinType 
    table: string
    cls:   ClassParam
    meta:  Meta
    as?:   string
    on?:   string
    sql?:  Fragment
    p?:    TypeRef<Constructor<any>>
}

export class WhereQuery<Table> implements SqlBuilder {
    protected _where:string[][] = []
    params: Record<string,any> = {}
    sql:ReturnType<typeof createSql>
    _alias?:string
    _aliases: Record<string,any> = {}
    _joins:Join[] = []
    _p:TypeRef<Table>

    constructor(public meta:Meta, public driver:Driver) {
        this.sql = (driver as any).sql ?? createSql(driver)
        this._p = this.sql.ref(meta.cls, '')
    }

    ref():TypeRef<Table> { return this._p }

    refs() : TypeRef<any> { 
        return [this._p].concat(this._joins.map(x => x.p).filter(x => !!x) as any[])
    }

    refOf<T>(cls:Constructor<T>) : TypeRef<T>|null {
        if (this.meta.cls === cls as any) {
            return this._p as any
        } else {
            for (const joinCls of this._joins) {
                if (joinCls.cls === cls) {
                    return joinCls.p as any
                }
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
        const join = this._joins.length > 0 
            ? this._joins[this._joins.length - 1]
            : null
        return join
            ? join.p
            : this._p
    }

    protected unwrap<T>(cls:Constructor<T>|TypeRef<T>) {
        return typeof cls == 'object' && cls.$ref
            ? cls.$ref.cls
            : cls
    }

    addJoin<T>(join:{ join:JoinType, cls:Constructor<T>|Constructor<any>[]|TypeRef<any>, on?:string|((...params:any[]) => Fragment), as?:string }) {
        // Fully qualify Table p ref
        if (!this._alias) {
            this._alias = this.quoteTable(this.meta.tableName)
            this._p = this.sql.ref(this.meta.cls, this._alias)
        }

        const joinCls = Array.isArray(join.cls)
            ? this.unwrap(join.cls[0])
            : this.unwrap(join.cls)

        const meta = Schema.assertMeta(joinCls)
        let on = typeof join.on == 'string' ? join.on : undefined
        const p = this.sql.ref(joinCls, join.as)
        if (typeof join.on == 'function') {
            const refs = Array.isArray(join.cls)
                ? join.cls.map(this.unwrap).map(x => this.sql.ref(x)).concat([this._p])
                : [this.prevJoin(), this.sql.ref(joinCls)]
            const sql = Schema.assertSql(join.on.call(this, ...refs))
            on = this.mergeParams(sql)
        }
        this._joins.push({ join:join.join, cls:join.cls, table:meta.tableName, meta, as:join.as, on, p })
        return this
    }
    join<T>(cls:Constructor<T>|Constructor<any>[]|TypeRef<any>, options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin({ join:"JOIN", cls, on:options?.on, as:options?.as })
    }
    leftJoin<T>(cls:Constructor<T>|Constructor<any>[], options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin({ join:"LEFT JOIN", cls, on:options?.on, as:options?.as })
    }
    rightJoin<T>(cls:Constructor<T>|Constructor<any>[], options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin({ join:"RIGHT JOIN", cls, on:options?.on, as:options?.as })
    }
    crossJoin<T>(cls:Constructor<T>|Constructor<any>[], options?:{ on?:string|((...params:any[]) => Fragment), as?:string }) {
        return this.addJoin({ join:"CROSS JOIN", cls, on:options?.on, as:options?.as })
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
            const sql = Schema.assertSql(options.call(this, ...this.refs()))
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

    condition(condition:string, options:WhereOptions) {
        if (options.sql) {
            const sql = Array.isArray(options.sql) ? options.sql : [options.sql]
            for (const fragment of sql) {
                this._where.push([condition, this.mergeParams(fragment)])
            }
        }
        if (options.rawSql) {
            const sql = Array.isArray(options.rawSql) ? options.rawSql : [options.rawSql]
            for (const fragment of sql) {
                this._where.push([condition, fragment])
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
    
    quoteColumn(column:string,table?:string) { 
        const prefix = this._alias ? this._alias + '.' : ''
        return prefix + this.driver.quoteColumn(column) 
    }

    alias<T extends ClassParam>(cls:T|string, alias?:string) {
        if (cls == null && alias == null) {
            this._alias = undefined
            this._aliases = {} 
        } else if (typeof cls == 'string') {
            this._alias = cls
            this._p = this.sql.ref(this.meta.cls, this._alias)
        } else if (cls != null && alias != null) {
            const meta = Schema.assertMeta(cls)
            this._aliases[meta.name] = alias
        }
        else throw Error(`Invalid alias(${typeof cls},${typeof(alias)})`)
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
            this._where.push([condition, `${this.driver.quoteColumn(prop.column.name)} ${sqlOp} $${prop.name}`])
            this.params[prop.name] = value
        }
    }

    get hasWhere() { return this._where.length > 0 }

    buildWhere() {
        if (this._where.length === 0) return ''
        let sql = ' WHERE '
        for (const [i, [condition, fragment]] of this._where.entries()) {
            if (i > 0) sql += ` ${condition} `
            sql += fragment
        }
        return sql
    }

    buildJoins() {
        if (this._joins.length == 0) return ''
        let sql = ''
        for (const join of this._joins) {
            const on = typeof join.on == 'string'
                ? ` ON ${join.on}`
                : ''
            sql += ` ${join.join} ${this.driver.quoteTable(join.table)}${on}`
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

export class SelectQuery<Table> extends WhereQuery<Table> {
    protected _select:string[] = []
    protected _skip:number | undefined
    protected _take:number | undefined
    p = new Proxy({}, { get: (target,key) => key })

    constructor(public meta:Meta, public driver:Driver) {
        super(meta,driver)
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
        if (this._alias && this._alias != quotedTable) {
            sql += ` ${this._alias}`
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

export class UpdateQuery<Table> extends WhereQuery<Table> {
    private _set:string[] = []

    constructor(public meta:Meta, public driver:Driver) {
        super(meta,driver)
    }

    set(options:{ sql?:Fragment|Fragment[], rawSql?:string|string[], values?:Record<string,any> }) {
        if (!options) {
            this._set.length = 0
        } else if (options.sql) {
            const sql = Array.isArray(options.sql) ? options.sql : [options.sql]
            for (const fragment of sql) {
                this._set.push(fragment.sql)
                this.addParams(fragment.params)
            }
        }
        if (options.rawSql) {
            const sql = Array.isArray(options.rawSql) ? options.rawSql : [options.rawSql]
            for (const fragment of sql) {
                this._set.push(fragment)
            }
        }
        if (options.values) {
            for (const [key, value] of Object.entries(options.values)) {
                const prop = this.meta.props.find(x => x.name === key)
                if (!prop) throw new Error(`Property ${key} not found in ${this.meta.name}`)
                if (!prop.column) throw new Error(`Property ${key} is not a column`)
                this.params[prop.name] = value
                this._set.push(`${this.driver.quote(prop.column.name)} = $${prop.name}`)
            }
        }
        return this
    }

    get hasSet() { return this._set.length > 0 }

    buildUpdate() {
        const sqlSet = this._set.join(', ')
        const sql = `UPDATE ${this.quoteTable(this.meta.tableName)} SET ${sqlSet}${this.buildWhere()}`
        return sql
    }

    build() {
        const sql = this.buildUpdate()
        return { sql, params:this.params }
    }
}

export class DeleteQuery<Table> extends WhereQuery<Table> {
    constructor(public meta:Meta, public driver:Driver) {
        super(meta,driver)
    }

    buildDelete() {
        const sql = `DELETE FROM ${this.quoteTable(this.meta.tableName)}${this.buildWhere()}`
        return sql
    }

    build() {
        const sql = this.buildDelete()
        return { sql, params:this.params }
    }
}
*/