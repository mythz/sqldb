import postgres from 'postgres'

// You can specify any property from the postgres-js connection options
const sql = postgres("postgres://test:test@localhost:5432/test")
export default sql
