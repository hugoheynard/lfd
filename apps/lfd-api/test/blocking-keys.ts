/**
 * Le catalogue Postgres lu par les gardes de couverture des remises à blanc
 * du dev (purge du scénario, « Tout recharger ») : les clés étrangères qui
 * refusent une suppression, et les tables qui existent.
 */
import type { E2eContext } from "./e2e-harness.js";

/** Une clé étrangère qui bloque la suppression de la table qu'elle vise. */
export interface BlockingKey {
  readonly child: string;
  readonly constraint: string;
  readonly target: string;
}

/**
 * `confdeltype` : `c` cascade, `n` set null, `d` set default suivent la
 * suppression ; `r` (RESTRICT) et `a` (NO ACTION) la refusent.
 */
export async function readBlockingKeys(ctx: E2eContext): Promise<readonly BlockingKey[]> {
  return ctx.prisma.$queryRaw<BlockingKey[]>`
    SELECT cn.nspname || '.' || c.relname AS child,
           con.conname::text              AS "constraint",
           tn.nspname || '.' || t.relname AS target
      FROM pg_constraint con
      JOIN pg_class c      ON c.oid = con.conrelid
      JOIN pg_namespace cn ON cn.oid = c.relnamespace
      JOIN pg_class t      ON t.oid = con.confrelid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace
     WHERE con.contype = 'f'
       AND con.confdeltype NOT IN ('c', 'n', 'd')
     ORDER BY 3, 1, 2`;
}

export async function readTables(ctx: E2eContext): Promise<ReadonlySet<string>> {
  const rows = await ctx.prisma.$queryRaw<{ readonly name: string }[]>`
    SELECT n.nspname || '.' || c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r', 'p')`;
  return new Set(rows.map((row) => row.name));
}
