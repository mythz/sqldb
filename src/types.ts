import { SyncConnection } from "./connection";

export type Params = Record<string, any> | any[];

export type DbBinding =
    | string
    | bigint
    | NodeJS.TypedArray
    | number
    | boolean
    | null
    | Record<
        string,
        string | bigint | NodeJS.TypedArray | number | boolean | null>;

export interface ReflectMeta {
    name: string
    $id: symbol
    $type: { name:string, table?:TableDefinition }
    $props: [{ name:string, column?:ColumnDefinition }]
}

export type ColumnType = 'INTEGER' | 'SMALLINT' | 'BIGINT'
    | 'DECIMAL' | 'NUMERIC' | 'REAL' | 'FLOAT' | 'DOUBLE' | 'MONEY'
    | 'DATE' | 'DATETIME' | 'TIME' | 'TIMEZ' | 'TIMESTAMP' | 'TIMESTAMPZ'
    | 'INTERVAL' | 'BOOLEAN'
    | 'UUID' | 'BLOB' | 'BYTES' | 'BIT'
    | 'TEXT' | 'VARCHAR' | 'NVARCHAR' | 'CHAR' | 'NCHAR' | 'JSON' | 'JSONB' | 'XML'

export type Constructor<T> = new (...args: any[]) => T
export type ConstructorWithParams<T, P extends any[]> = new (...args: P) => T

export type ClassParam = ReflectMeta | { constructor:ReflectMeta } | Constructor<any>
export type ClassInstance = { constructor:ReflectMeta } & Record<string, any> | Record<string, any>

export interface TableDefinition {
    name: string
    alias?: string
}

export interface ColumnDefinition {
    name: string
    alias?: string
    type: string
    primaryKey?: boolean
    autoIncrement?: boolean
    required?: boolean
    precision?: number
    scale?: number
    unique?: boolean
    index?: boolean
    defaultValue?: string
}

export interface Statement<ReturnType, ParamsType extends DbBinding[]> {
    get native():any

    all(...params: ParamsType): Promise<ReturnType[]>
    allSync(...params: ParamsType): ReturnType[]
    first(...params: ParamsType): Promise<ReturnType | null>
    firstSync(...params: ParamsType): ReturnType | null

    column<ReturnValue>(...params: ParamsType): Promise<ReturnValue[]>
    columnSync<ReturnValue>(...params: ParamsType): ReturnValue[]

    scalar<ReturnValue>(...params: ParamsType): Promise<ReturnValue | null>
    scalarSync<ReturnValue>(...params: ParamsType): ReturnValue | null

    arrays(...params: ParamsType): Promise<any[][]>
    arraysSync(...params: ParamsType): any[][]
    array(...params: ParamsType): Promise<any[] | null>
    arraySync(...params: ParamsType): any[] | null

    exec(...params: ParamsType): Promise<{ changes: number; lastInsertRowid: number | bigint; }>
    execSync(...params: ParamsType): { changes: number; lastInsertRowid: number | bigint; }
}

export interface NamingStrategy {
    schemaName(schema:string) : string
    tableName(table:string) : string
    columnName(column:string) : string
    schemaFromDef(def:TableDefinition) : string | undefined
    tableFromDef(def:TableDefinition) : string
}

export interface TypeConverter {
    toDb(value: any): any;
    fromDb(value: any): any;
}

export interface DbRow {
    table: string
    keys: string[]
    values: { [key: string]: any }
}

export interface Driver
{
    get name(): string;
    
    get sync(): SyncConnection | undefined;

    get converters(): { [key: string]: TypeConverter };

    quote(name: string): string
    
    quoteTable(name: string): string

    quoteColumn(name: string, table?:string): string

    sqlColumnDefinition(column: ColumnDefinition): string;

    sqlIndexDefinition(table: TableDefinition, column: ColumnDefinition): string;

    sqlTableNames(schema?: string): string

    sqlLimit(skip?: number, take?: number): string

    prepareRaw<ReturnType, ParamsType extends DbBinding[]>(sql:String) 
        : Statement<ReturnType, ParamsType extends any[] ? ParamsType : [ParamsType]>
    
    prepare<ReturnType, ParamsType extends DbBinding[]>(strings: TemplateStringsArray, ...params: DbBinding[])
        : Statement<ReturnType, ParamsType extends any[] ? ParamsType : [ParamsType]>
}

export type Fragment = { sql:string, params?:Record<string,any> }

export interface SqlBuilder {
    build(): { sql:string, params:Record<string,any> }
}
