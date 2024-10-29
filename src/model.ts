import { ColumnType } from "./types";

export enum DataType {
    INTEGER = 'INTEGER',
    SMALLINT = 'SMALLINT',
    BIGINT = 'BIGINT',

    DECIMAL = 'DECIMAL',
    NUMERIC = 'NUMERIC',
    REAL = 'REAL',
    FLOAT = 'FLOAT',
    DOUBLE = 'DOUBLE',
    MONEY = 'MONEY',

    DATE = 'DATE',
    DATETIME = 'DATETIME',
    TIME = 'TIME',
    TIMEZ = 'TIMEZ',
    TIMESTAMP = 'TIMESTAMP',
    TIMESTAMPZ = 'TIMESTAMPZ',

    INTERVAL = 'INTERVAL',
    BOOLEAN = 'BOOLEAN',

    UUID = 'UUID',
    BLOB = 'BLOB',
    BYTES = 'BYTES',
    BIT = 'BIT',

    TEXT = 'TEXT',
    VARCHAR = 'VARCHAR',
    NVARCHAR = 'NVARCHAR',    
    CHAR = 'CHAR',
    NCHAR = 'NCHAR',
    JSON = 'JSON',
    JSONB = 'JSONB',
    XML = 'XML',
}

export const DefaultValues = {
    NOW: '{NOW}',
    MAX_TEXT: '{MAX_TEXT}',
    MAX_TEXT_UNICODE: '{MAX_TEXT_UNICODE}',
    TRUE: '{TRUE}',
    FALSE: '{FALSE}',
}

export function table(options?: {
        alias?: string
    }) {
    return function (target: any) {
        const table =  Object.assign({}, options, { name:options?.alias ?? target.name });
        if (!target.$id) target.$id = Symbol(target.name)
        target.$type ??= { name:target.name }
        target.$type.table = table
    };
}

export function column(type:ColumnType|symbol, options?: {
        alias?: string
        primaryKey?: boolean
        autoIncrement?: boolean
        required?: boolean
        precision?: number
        scale?: number
        unique?: boolean
        index?: boolean
        defaultValue?: string
    }) {
    return function (target: any, propertyKey: string) {
        const column = Object.assign({}, options, { type:type, name:options?.alias ?? propertyKey })
        if (propertyKey === 'id') column.primaryKey = true
        if (!target.constructor.$id) target.constructor.$id = Symbol(target.constructor.name)
        const props = (target.constructor.$props ?? (target.constructor.$props=[]))
        let prop = props.find((x:any) => x.name === propertyKey)
        if (!prop) {
            prop = { name:propertyKey }
            props.push(prop)
        }
        prop.column = column
        if (typeof prop.column.type == 'symbol') {
            prop.column.type = (prop.column.type as symbol).description
        }
    };
}

export class Raw {
    constructor(public value: string){}
}


interface TableDefinition<T> {
    table?: TableConfig;
    columns: ColumnsConfig<T>;
}
interface ColumnConfig {
    alias?: string;
    type: ColumnType|symbol;    
    primaryKey?: boolean
    autoIncrement?: boolean
    required?: boolean
    precision?: number
    scale?: number
    unique?: boolean
    index?: boolean
    defaultValue?: string
}

// Table configuration interface
interface TableConfig {
    alias?: string;
}
// Helper type to ensure all properties in columns are keys of T
type ColumnsConfig<T> = {
    [K in keyof Partial<T>]: ColumnConfig;
};

export function Table<T extends object>(
    cls: new () => T,
    definition: TableDefinition<T>) {
    if (!definition) throw new Error('Table definition is required')

    if (!cls.$id) cls.$id = Symbol(cls.name)
        // Set the table name and alias if provided
    cls.$type ??= { name:cls.name }
    cls.$type.table = definition.table ?? { }
    cls.$type.table.name ??= cls.name

    const props = (cls.$props ?? (cls.$props=[]))
    Object.keys(definition.columns).forEach(name => {
        const column = definition.columns[name]
        if (!column) throw new Error(`Column definition for ${name} is missing`)
        if (!column.type) throw new Error(`Column type for ${name} is missing`)

        let prop = props.find((x:any) => x.name === name)
        if (!prop) {
             prop = { name }
             props.push(prop)
        }
        prop.column = column
        prop.column.name ??= column.alias ?? name
        if (typeof prop.column.type == 'symbol') {
            prop.column.type = (prop.column.type as symbol).description
        }
    })
    return cls
}
