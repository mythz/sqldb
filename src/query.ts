import type { ClassParam, Driver, Fragment, ReflectMeta, SqlBuilder } from "./types"
import { Meta, Schema } from "./connection"

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

type WhereOptions = { 
    eq?:      Record<string,any>
    '='?:     Record<string,any>
    notEq?:   Record<string,any> 
    '!='?:    Record<string,any>
    gt?:      Record<string,any> 
    '>'?:     Record<string,any>
    gte?:     Record<string,any> 
    '>='?:    Record<string,any>
    lt?:      Record<string,any> 
    '<'?:     Record<string,any>
    lte?:     Record<string,any>
    '<='?:    Record<string,any>
    in?:      Record<string,any>
    notIn?:   Record<string,any>
    like?:    Record<string,any>
    notLike?: Record<string,any>
    isNull?:  Record<string,any>
    notNull?: Record<string,any>
    op?:      [string, Record<string,any>]
    sql?:     Fragment|Fragment[] 
    rawSql?:  string|string[]
}

export function createSql(driver:Driver) {
    function sql(strings: TemplateStringsArray|string, ...params: any[]) : Fragment {
        if (Array.isArray(strings)) {
            let sb = ''
            const sqlParams:Record<string,any> = {}
            for (let i = 0; i < strings.length; i++) {
                sb += strings[i]
                if (i < params.length) {
                    const name = `${i+1}`
                    sb += `$${name}`
                    sqlParams[name] = params[i]
                }
            }
            return ({ sql:sb, params:sqlParams })
        } else if (typeof strings === 'string') {
            return ({ sql:strings, params:params[0] })
        } else throw new Error(`sql(${typeof strings}) is invalid`)
    }
    sql.column = function<T extends ClassParam>(cls:T, prop:string) {
        const meta = Schema.assertMeta(cls)
        const column = meta.props.find(x => x.name == prop)?.column
        if (!column) throw new Error(`Could not find column ${prop} on ${meta.name}`)
        return { sql:driver.quoteColumn(column.name) }
    }
    return sql
}

type JoinType = "JOIN" | "INNER JOIN" | "LEFT JOIN" | "RIGHT JOIN" | "OUTER JOIN" | "CROSS JOIN"
type Join = {
    join:  JoinType 
    table: string
    cls:   ClassParam
    meta:  Meta
    as?:   string
    on?:   string
    sql?:  Fragment
}

export class WhereQuery implements SqlBuilder {
    protected _where:string[][] = []
    params: Record<string,any> = {}
    sql:ReturnType<typeof createSql>
    _alias?:string
    _aliases: Record<string,any> = {}
    _joins:Join[] = []

    constructor(public meta:Meta, public driver:Driver) {
        this.sql = (driver as any).sql ?? createSql(driver)
    }

    prevJoin() {
        const join = this._joins.length > 0 
            ? this._joins[this._joins.length - 1]
            : null
        return join
            ? { meta:join, as:join.as ?? this.quoteTable(join.meta.tableName) }
            : { meta:this.meta, as:this._alias ?? this.quoteTable(this.meta.tableName) }
    }

    addJoin<T extends ClassParam>(join:{ join:JoinType, cls:T, on?:string|((...params:any[]) => string), as?:string }) {
        const meta = Schema.assertMeta(join.cls)
        let on = join.on
        if (typeof join.on == 'function') {
            const quote = (meta:Meta, prop:string) => {
                const p = meta.props.find(x => x.name == prop)?.column
                if (!p) throw new Error(`${meta.name} does not have a column property ${prop}`)
                return this.driver.quoteColumn(p.name)
            }
            const get = (target: { prefix:string, meta:Meta }, key:string|symbol) => target.prefix + quote(meta, typeof key == 'string' ? key : key.description!)
            const lJoin = this.prevJoin()
            const l = new Proxy({ prefix:lJoin.as + '.', meta:lJoin.meta }, { get })
            const r = new Proxy({ prefix:(join.as ?? this.driver.quoteTable(meta.tableName)) + '.', meta }, { get })
            on = join.on(l, r)
        }
        this._joins.push({ join:join.join, cls:join.cls, table:meta.tableName, meta, as:join.as, on })
        return this
    }
    join<T extends ClassParam>(cls:T, options:{ on?:string|((...params:any[]) => string), as?:string }) {
        return this.addJoin({ join:"JOIN", cls, on:options?.on, as:options?.as })
    }
    leftJoin<T extends ClassParam>(cls:T, options:{ on?:string|((...params:any[]) => string), as?:string }) {
        return this.addJoin({ join:"LEFT JOIN", cls, on:options?.on, as:options?.as })
    }
    rightJoin<T extends ClassParam>(cls:T, options:{ on?:string|((...params:any[]) => string), as?:string }) {
        return this.addJoin({ join:"RIGHT JOIN", cls, on:options?.on, as:options?.as })
    }
    crossJoin<T extends ClassParam>(cls:T, options:{ on?:string|((...params:any[]) => string), as?:string }) {
        return this.addJoin({ join:"CROSS JOIN", cls, on:options?.on, as:options?.as })
    }

    where(options:WhereOptions|TemplateStringsArray, ...params:any[]) { 
        return this.and(options, ...params)
    }

    and(options:WhereOptions|TemplateStringsArray, ...params:any[]) {
        if (!options && params.length == 0) {
            this._where.length = 0
            return this
        } else if (Array.isArray(options)) {
            return this.condition('AND', { sql: this.sql(options as TemplateStringsArray, ...params) }) 
        } else {
            return this.condition('AND', options as WhereOptions) 
        }
    }

    or(options:WhereOptions|TemplateStringsArray, ...params:any[]) { 
        if (!options && params.length == 0) {
            this._where.length = 0
        } else if (Array.isArray(options)) {
            return this.condition('AND', { sql: this.sql(options as TemplateStringsArray, ...params) }) 
        } else {
            return this.condition('AND', options as WhereOptions) 
        }
    }

    condition(condition:string, options:WhereOptions) {
        if (options.sql) {
            const sql = Array.isArray(options.sql) ? options.sql : [options.sql]
            for (const fragment of sql) {
                this._where.push([condition, fragment.sql])
                this.addParams(fragment.params)
            }
        }
        if (options.rawSql) {
            const sql = Array.isArray(options.rawSql) ? options.rawSql : [options.rawSql]
            for (const fragment of sql) {
                this._where.push([condition, fragment])
            }
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

export class SelectQuery extends WhereQuery {
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
            const select = this.sql(options as TemplateStringsArray, ...params)
            this._select.push(select.sql)
            this.addParams(select.params)
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
            const p = this.p
            const columns = options.call(this,p,p,p,p,p,p,p,p)
            for (const item of columns) {
                if (typeof item == 'string') {
                    const column = this.meta.props.find(x => x.name == item)?.column
                    if (!column) throw new Error(`Could not find column '${item}' on '${this.meta.name}'`)
                    this._select.push(this.quoteColumn(column.name))
                } else if (typeof item == 'object' && item.sql) {
                    this._select.push(item.sql)
                    this.addParams(item.params)
                } else if (item == null) { } //ignore
                else throw new Error(`Invalid select => [${typeof item}]`)
            }
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
        let sql = `FROM ${this.quoteTable(this.meta.tableName)}`
        if (this._alias) {
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

export class UpdateQuery extends WhereQuery {
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

export class DeleteQuery extends WhereQuery {
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
