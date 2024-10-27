import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

// You can specify any property from the postgres-js connection options
const queryClient = postgres("postgres://test:test@localhost:5432/test")

export const dbPostgres = drizzle({ client: queryClient })
