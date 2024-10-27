import { describe, it, expect } from 'bun:test'
import { one, two, add, helloSqlite, helloPostgres } from '../src'

describe('should', () => {
  it('export 1', () => {
    expect(one).toBe(1)
  })

  it('export 2', () => {
    expect(two).toBe(2)
  })

  it('add 1 + 2', () => {
    expect(add(1, 2)).toBe(3)
  })

  it('hello sqlite', () => {
    const result = helloSqlite()
    console.log(result)
    expect(result).toEqual(["hello world"])
  })

  it('hello postgres', async () => {
    const result = await helloPostgres()
    console.log(result)
    expect(result).toEqual(["hello world"])
  })

})
