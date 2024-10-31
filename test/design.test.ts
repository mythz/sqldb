class A { id?:string }
class B { name?:string }
class C { email?:string }

type Constructor<T> = new (...args: any[]) => T;

// Helper type to convert tuple of constructors to tuple of instances
type ConstructorToInstances<T> = {
    [K in keyof T]: T[K] extends Constructor<infer U> ? U : never;
};

class SelectQuery<Tables extends Constructor<any>[]> {
    constructor(public tables: [...Tables]) {}

    join<NewTable>(tableClass: Constructor<NewTable>): SelectQuery<[...Tables, Constructor<NewTable>]> {
        return new SelectQuery([...this.tables, tableClass]) as SelectQuery<[...Tables, Constructor<NewTable>]>;
    }

    select<R>(selector: (...params: ConstructorToInstances<Tables>) => R): R {
        // Create instances for the selector
        const instances = this.tables.map(Table => new Table()) as ConstructorToInstances<Tables>;
        return selector(...instances);
    }
}

// Usage demonstration
const q = new SelectQuery([A]);
const withAB = q.join(B);
const withABC = withAB.join(C);

// These should all type check correctly now
const result1 = q.select((a: A) => {
    return "just A";
});

const result2 = withAB.select((a: A, b: B) => {
    return "A and B";
});

const result3 = withABC.select((a: A, b: B, c: C) => {
    return "A, B, and C";
});

//const r4 = withABC.select((a,b) => sql`${a.id}, ${b.name}`)

// This should now properly show a type error
// @ts-expect-error
withAB.select((a: A, b: B, c: C) => ''); // Error: too many parameters

