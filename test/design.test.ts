type Constructor<T> = new (...args: any[]) => T;

type TypeRefs<Tables extends Constructor<any>[]> = {
    [K in keyof Tables]: TypeRef<InstanceType<Tables[K]>>
}

export type TypeRef<T> = T & { as?:string }

class Driver {}
class Meta {}

class WhereQuery<Tables extends Constructor<any>[]> {
    constructor(
        public driver: Driver,
        public tables: [...Tables],
        public metas: Meta[],
        public refs: TypeRefs<Tables>
    ) {}

    join<NewTable extends new (...args: any[]) => any>(
        table: NewTable
    ) {
        const meta = {} as Meta;
        const ref = { type: table.name } as TypeRef<InstanceType<NewTable>>;
        
        return new (this.constructor as any)(
            this.driver,
            [...this.tables, table],
            [...this.metas, meta], 
            [...this.refs, ref]
        );
    }
}

class SelectQuery<Tables extends Constructor<any>[]> extends WhereQuery<Tables> {
    select(arg:string) { return arg }
}

class DeleteQuery<Tables extends Constructor<any>[]> extends WhereQuery<Tables> {
    delete(arg:string) { return arg }
}

class A { id?:string }
class B { name?:string }
class C { email?:string }

function fromSelect<Table>(table: Constructor<Table>) { 
    return new SelectQuery(new Driver, [table], [new Meta], [{ } as TypeRef<Table>]) 
}
function fromDelete<Table>(table: Constructor<Table>) { 
    return new DeleteQuery(new Driver, [table], [new Meta], [{ } as TypeRef<Table>]) 
}


function example() {

    const qSelect = fromSelect(A)
    const selectAB = qSelect.join(B)// as SelectQuery<[Constructor<A>,Constructor<B>]>
    const selectABC = selectAB.join(C)// as SelectQuery<[Constructor<A>,Constructor<B>,Constructor<C>]>
    const selectResult = selectABC.select('')
    
    
    const qDelete = fromDelete(A)
    const deleteAB = qDelete.join(B)// as DeleteQuery<[Constructor<A>,Constructor<B>]>
    const deleteABC = deleteAB.join(C)// as DeleteQuery<[Constructor<A>,Constructor<B>,Constructor<C>]>
    const deleteResult = deleteABC.delete('')

    const q = fromSelect(A)
    const b = q.createInstance(B)
    const c = b.where``
    const withB = q.join(B)
    const ref1 = withB.refs[0]
    const ref2 = withB.refs[1]
    const withBC = withB.join(C)
    const ref3 = withBC.refs[2]
    console.log(ref1.id, ref2.name, ref3.email)
}