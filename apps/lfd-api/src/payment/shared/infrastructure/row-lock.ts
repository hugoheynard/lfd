import { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **Les tables du bloc qu'on verrouille**, nommées UNE fois, qualifiées par
 * leur schéma.
 *
 * Prisma n'a pas de `SELECT … FOR UPDATE` : le verrou d'une ligne est une
 * requête brute, et le compilateur ne voit pas le nom qu'elle porte. Un
 * renommage oublié ici casserait chaque dépôt au premier remboursement ; un
 * e2e (`test/payment-row-lock.e2e-spec.ts`) confronte donc chaque entrée au
 * catalogue Postgres et prend réellement chaque verrou.
 */
export const LOCKABLE_TABLES = {
  card_payment: Prisma.raw('"payment"."card_payment"'),
  card_refund_request: Prisma.raw('"payment"."card_refund_request"'),
  pay_link: Prisma.raw('"payment"."pay_link"'),
} as const;

/** Une table du bloc qu'un dépôt peut verrouiller. */
export type LockableTable = keyof typeof LOCKABLE_TABLES;

/**
 * Verrouille, jusqu'à la fin de la transaction ambiante, les lignes de `table`
 * qui satisfont `condition`. À n'appeler que sous une unité de travail : hors
 * transaction, le verrou tombe à la fin de la requête.
 */
export async function lockRows(
  prisma: PrismaService,
  table: LockableTable,
  condition: Prisma.Sql,
): Promise<void> {
  await prisma.$queryRaw`SELECT "id" FROM ${LOCKABLE_TABLES[table]} WHERE ${condition} FOR UPDATE`;
}

/** Verrouille la ligne `id` de `table` (cf. {@link lockRows}). */
export async function lockRow(
  prisma: PrismaService,
  table: LockableTable,
  id: string,
): Promise<void> {
  await lockRows(prisma, table, Prisma.sql`"id" = ${id}`);
}
