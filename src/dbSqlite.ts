import type { ColumnDefinition, Driver, DbBinding, Statement, TableDefinition, TypeConverter } from "./types"
import { Database, Statement as BunStatement } from "bun:sqlite"
import { NamingStrategy, SyncConnection } from "./connection"
import { DataType, DefaultValues } from "./model"
import { converterFor, DateTimeConverter } from "./converters"
import { createSql } from "./query"

function create(options?:{ wal?:boolean }) {
    const db = new Database("app.db", { 
        strict: true 
    })
    if (options?.wal === false) {
        db.exec("PRAGMA journal_mode = WAL;");
    }
    return db;   
}

class SqliteStatement<ReturnType, ParamsType extends DbBinding[]>
    implements Statement<ReturnType, ParamsType>
{
    native: BunStatement<ReturnType, ParamsType>
    constructor(statement: BunStatement<ReturnType, ParamsType>) {
        this.native = statement
    }

    all(...params: ParamsType): Promise<ReturnType[]> {
        return Promise.resolve(this.native.all(...params))
    }
    allSync(...params: ParamsType): ReturnType[] {
        return this.native.all(...params)
    }
    first(...params: ParamsType): Promise<ReturnType | null> {
        return Promise.resolve(this.native.get(...params))
    }
    firstSync(...params: ParamsType): ReturnType | null {
        return this.native.get(...params)
    }

    column<ReturnValue>(...params: ParamsType): Promise<ReturnValue[]> {
        return Promise.resolve(this.native.values(...params).map(row => row[0] as ReturnValue))
    }
    columnSync<ReturnValue>(...params: ParamsType): ReturnValue[] {
        return this.native.values(...params).map(row => row[0] as ReturnValue)
    }

    scalar<ReturnValue>(...params: ParamsType): Promise<ReturnValue | null> {
        return Promise.resolve(this.native.values(...params).map(row => row[0] as ReturnValue)?.[0] ?? null)
    }
    scalarSync<ReturnValue>(...params: ParamsType): ReturnValue | null {
        return this.native.values(...params).map(row => row[0] as ReturnValue)?.[0] ?? null
    }

    arrays(...params: ParamsType): Promise<any[][]> {
        return Promise.resolve(this.native.values(...params))
    }
    arraysSync(...params: ParamsType): any[][] {
        return this.native.values(...params)
    }
    array(...params: ParamsType): Promise<any[] | null> {
        return Promise.resolve(this.native.values(...params)?.[0] ?? null)
    }
    arraySync(...params: ParamsType): any[] | null {
        return this.native.values(...params)?.[0] ?? null
    }

    exec(...params: ParamsType): Promise<{ changes: number; lastInsertRowid: number | bigint; }> {
        //console.log('params',params)
        return Promise.resolve(this.native.run(...params))
    }
    execSync(...params: ParamsType): { changes: number; lastInsertRowid: number | bigint; } {
        //console.log('params',params)
        return this.native.run(...params)
    }    
}

class Types {
    // SQLite aliases, use as-is
    static NATIVE = [
        DataType.INTEGER, DataType.SMALLINT, DataType.BIGINT, // INTEGER
        DataType.REAL, DataType.DOUBLE, DataType.FLOAT,  // REAL
        DataType.NUMERIC, DataType.DECIMAL, DataType.BOOLEAN, DataType.DATE, DataType.DATETIME, //NUMERIC
    ]
    static map = {
        INTEGER: [DataType.INTERVAL],
        REAL:    [DataType.REAL],
        NUMERIC: [DataType.DECIMAL, DataType.NUMERIC, DataType.MONEY],
        BLOB:    [DataType.BLOB, DataType.BYTES, DataType.BIT],
        TEXT: [
            DataType.UUID, DataType.JSON, DataType.JSONB, DataType.XML, 
            DataType.TIME, DataType.TIMEZ, DataType.TIMESTAMP, DataType.TIMESTAMPZ,
        ],
    }
}

class SqliteDriver implements Driver
{
    db:Database
    sync: SyncConnection
    name: string
    sql:ReturnType<typeof createSql>
    strategy:NamingStrategy = new NamingStrategy()
    variables: { [key: string]: string } = {
        [DefaultValues.NOW]: 'CURRENT_TIMESTAMP',
        [DefaultValues.MAX_TEXT]: 'TEXT',
        [DefaultValues.MAX_TEXT_UNICODE]: 'TEXT',
        [DefaultValues.TRUE]: '1',
        [DefaultValues.FALSE]: '0',
    }

    converters: { [key: string]: TypeConverter } = {
        ...converterFor(DateTimeConverter.instance, DataType.DATE, DataType.DATETIME, DataType.TIMESTAMP, DataType.TIMESTAMPZ),
    }

    constructor(db:Database) {
        this.db = db
        this.sync = new SyncConnection(this)
        this.name = this.constructor.name
        this.sql = createSql(this)
    }

    quote(name: string): string { return `"${name}"` }
    
    quoteTable(name: string): string { return this.quote(this.strategy.tableName(name)) }

    quoteColumn(name: string): string { return this.quote(this.strategy.columnName(name)) }

    sqlTableNames(): string {
        return "SELECT name FROM sqlite_master WHERE type ='table' AND name NOT LIKE 'sqlite_%'"
    }

    sqlIndexDefinition(table: TableDefinition, column: ColumnDefinition): string {
        const unique = column.unique ? 'UNIQUE INDEX' : 'INDEX'
        return `CREATE ${unique} idx_${table.name}_${column.name} ON ${this.quoteTable(table.name)} (${this.quoteColumn(column.name)})`
    }

    sqlColumnDefinition(column: ColumnDefinition): string {
        let dataType = column.type as DataType
        let type = Types.NATIVE.includes(dataType) ? dataType : undefined
        if (!type) {
            for (const [sqliteType, typeMapping] of Object.entries(Types.map)) {
                if (typeMapping.includes(dataType)) {
                    type = sqliteType as DataType
                    break
                }
            }
        }
        if (!type) type = dataType

        let sb = `${this.quoteColumn(column.name)} ${type}`
        if (column.primaryKey) {
            sb += ' PRIMARY KEY'
        }
        if (column.autoIncrement) {
            sb += ' AUTOINCREMENT'
        }
        if (column.required) {
            sb += ' NOT NULL'
        }
        if (column.unique && !column.index) {
            sb += ' UNIQUE'
        }
        if (column.defaultValue) {
            const val = this.variables[column.defaultValue] ?? column.defaultValue
            sb += ` DEFAULT ${val}`
        }
        return sb
    }

    sqlLimit(skip?: number, take?: number): string {
        return skip == null && take == null
            ? '' 
            : skip
                ? `LIMIT ${take} OFFSET ${skip}`
                : `LIMIT ${take}`
    }

    prepareRaw<ReturnType, ParamsType extends DbBinding | DbBinding[]>(sql: string) {
        return new SqliteStatement(this.db.query<ReturnType, ParamsType>(sql))
    }
    prepare<ReturnType, ParamsType extends DbBinding[]>(strings: TemplateStringsArray, ...params: DbBinding[])
        : Statement<ReturnType, ParamsType extends any[] ? ParamsType : [ParamsType]> {
            let sb = ''
            for (let i = 0; i < strings.length; i++) {
                sb += strings[i]
                if (i < params.length) {
                    sb += `?${i+1}`
                }
            }
            return new SqliteStatement(this.db.query<ReturnType, ParamsType>(sb))
        }
}

export const driver =  new SqliteDriver(create())
export const sync = driver.sync
export const sql = driver.sql
export const $ = driver.sql
export default driver
