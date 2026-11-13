import type { PrismaService } from "../../../platform/database/prisma.service.js";
import { abandonedAttemptWhere } from "../../orders/infrastructure/abandoned-attempt.where.js";

/**
 * Les identifiants des commandes qui sont des **tentatives de carte
 * abandonnées**, selon le critère unique des commandes
 * (`abandoned-attempt.where.ts`). Les lecteurs des statistiques en écartent les
 * `order.placed` correspondants (`withoutAbandonedAttempts`).
 */
export async function abandonedAttemptOrderIds(
  prisma: PrismaService,
): Promise<ReadonlySet<string>> {
  const rows = await prisma.order.findMany({
    where: abandonedAttemptWhere(),
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
