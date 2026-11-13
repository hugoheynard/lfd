import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { MetricsSql, MetricsSqlValue } from "../cache-metrics-store";

/**
 * Le stockage SQLite d'un Durable Object, joué par `node:sqlite` : la même
 * forme (`MetricsSql`), une vraie base en mémoire.
 */
export class NodeSql implements MetricsSql {
  readonly db = new DatabaseSync(":memory:");

  exec<T extends Record<string, MetricsSqlValue>>(
    query: string,
    ...bindings: MetricsSqlValue[]
  ): { toArray(): T[] } {
    const statement = this.db.prepare(query);
    const values = bindings.map((value): SQLInputValue =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    );
    if (/^\s*select/iu.test(query)) {
      const rows = statement.all(...values).map((row) => normalised<T>(row));
      return { toArray: () => rows };
    }
    statement.run(...values);
    return { toArray: () => [] };
  }
}

function normalised<T extends Record<string, MetricsSqlValue>>(row: object): T {
  const out: Record<string, MetricsSqlValue> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "bigint" ? Number(value) : (value as MetricsSqlValue);
  }
  return out as T;
}
