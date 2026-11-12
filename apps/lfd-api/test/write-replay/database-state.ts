import type { PrismaService } from "../../src/platform/database/prisma.service.js";

/** L'état d'une table : son nombre de lignes et l'empreinte de son contenu. */
export interface TableState {
  readonly rows: number;
  readonly digest: string;
}

/** L'état de chaque table de la base, par `schéma.table`. */
export type DatabaseState = ReadonlyMap<string, TableState>;

/**
 * Relève TOUTES les tables, plutôt que celles que le handler est censé écrire :
 * une liste écrite à la main oublierait précisément la table qu'un rejeu
 * double par un chemin qu'on n'a pas lu (un abonné, une trace, la boîte
 * d'envoi). L'empreinte (md5 des lignes triées) voit aussi une mise à jour,
 * qu'un simple compte ne voit pas. Les tables sont lues dans le catalogue
 * Postgres, comme le fait `truncateAll` du harnais.
 */
export async function databaseState(prisma: PrismaService): Promise<DatabaseState> {
  const tables = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND tablename <> '_prisma_migrations'
  `;
  const union = tables
    .map(
      ({ schemaname, tablename }) =>
        `SELECT '${schemaname}.${tablename}' AS name, count(*)::int AS rows, ` +
        `md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) AS digest ` +
        `FROM "${schemaname}"."${tablename}" t`,
    )
    .join(" UNION ALL ");
  const found =
    await prisma.$queryRawUnsafe<{ name: string; rows: number; digest: string }[]>(union);
  return new Map(found.map(({ name, rows, digest }) => [name, { rows, digest }]));
}

/**
 * Les tables qui ont changé entre deux relevés : `{ table: écart de lignes }`
 * (`0` pour une table dont seul le contenu a changé).
 */
export function stateDelta(before: DatabaseState, after: DatabaseState): Record<string, number> {
  const delta: Record<string, number> = {};
  for (const [name, state] of after) {
    const previous = before.get(name);
    if (previous === undefined || previous.digest !== state.digest) {
      delta[name] = state.rows - (previous?.rows ?? 0);
    }
  }
  return delta;
}
