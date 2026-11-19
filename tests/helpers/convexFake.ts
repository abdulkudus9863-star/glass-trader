/**
 * Minimal in-memory Convex context for exercising real Convex handlers
 * (`fn._handler(ctx, args)`) without a deployment.
 *
 * Supports exactly the database surface src/convex/paper.ts uses:
 *   db.get / db.insert / db.patch / db.delete /
 *   db.query(t).withIndex(name, q => q.eq(...))[.order(dir)].first|collect|take
 *
 * Index callbacks are recorded generically (eq/gt/gte/lt/lte) and applied as
 * filters; ordering is by _creationTime (Convex's index tiebreaker), asc or
 * reversed. Not a Convex emulator — just enough to run the real business
 * logic under test, including auth (ctx.auth.getUserIdentity()).
 */

export type Row = Record<string, any> & { _id: string; _creationTime: number };

interface Clause {
  field: string;
  op: "eq" | "gt" | "gte" | "lt" | "lte";
  value: any;
}

function applyClauses(rows: Row[], clauses: Clause[]): Row[] {
  return rows.filter((r) =>
    clauses.every((c) => {
      switch (c.op) {
        case "eq":
          return r[c.field] === c.value;
        case "gt":
          return r[c.field] > c.value;
        case "gte":
          return r[c.field] >= c.value;
        case "lt":
          return r[c.field] < c.value;
        case "lte":
          return r[c.field] <= c.value;
      }
    }),
  );
}

function buildIndexApi(rows: Row[], clauses: Clause[]) {
  let ordered: Row[] | null = null;
  const materialize = () => applyClauses(ordered ?? rows, clauses);
  const api: any = {
    order: (dir: "asc" | "desc") => {
      const base = ordered ?? [...rows];
      base.sort((a, b) =>
        a._creationTime === b._creationTime
          ? 0
          : (a._creationTime < b._creationTime ? -1 : 1) * (dir === "desc" ? -1 : 1),
      );
      ordered = base;
      return api;
    },
    first: async () => materialize()[0] ?? null,
    collect: async () => materialize(),
    take: async (n: number) => materialize().slice(0, n),
  };
  return api;
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  private seq = 0;

  private rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const found = rows.find((r) => r._id === id);
      if (found) return found;
    }
    return null;
  }

  async insert(table: string, doc: Record<string, any>): Promise<string> {
    this.seq += 1;
    const _id = `${table}:${this.seq}`;
    this.rows(table).push({
      ...doc,
      _id,
      _creationTime: 1_700_000_000_000 + this.seq,
    });
    return _id;
  }

  async patch(id: string, fields: Record<string, any>): Promise<void> {
    const row = await this.get(id);
    if (!row) throw new Error(`patch: no doc ${id}`);
    Object.assign(row, fields);
  }

  async delete(id: string): Promise<void> {
    for (const rows of this.tables.values()) {
      const idx = rows.findIndex((r) => r._id === id);
      if (idx >= 0) {
        rows.splice(idx, 1);
        return;
      }
    }
  }

  count(table: string): number {
    return this.rows(table).length;
  }

  /** Insert a fully-formed row (test seeding only). */
  seed(table: string, doc: Record<string, any>): string {
    this.seq += 1;
    const _id = (doc._id as string | undefined) ?? `${table}:${this.seq}`;
    this.rows(table).push({
      ...doc,
      _id,
      _creationTime: doc._creationTime ?? 1_700_000_000_000 + this.seq,
    });
    return _id;
  }

  query(table: string) {
    const base = buildIndexApi(this.rows(table), []);
    return {
      order: (dir: "asc" | "desc") => base.order(dir),
      first: () => base.first(),
      collect: () => base.collect(),
      take: (n: number) => base.take(n),
      withIndex: (_name: string, fn?: (q: any) => any) => {
        const clauses: Clause[] = [];
        if (fn) {
          const q: any = {};
          for (const op of ["eq", "gt", "gte", "lt", "lte"] as const) {
            q[op] = (field: string, value: any) => {
              clauses.push({ field, op, value });
              return q;
            };
          }
          fn(q);
        }
        return buildIndexApi(this.rows(table), clauses);
      },
    };
  }
}

/** ctx with optional authenticated subject (null = signed out). */
export function makeCtx(db: FakeDb, subject: string | null) {
  return {
    db,
    auth: {
      getUserIdentity: async () =>
        subject === null
          ? null
          : { subject, tokenIdentifier: subject, issuer: "test", name: subject },
    },
  } as any;
}
