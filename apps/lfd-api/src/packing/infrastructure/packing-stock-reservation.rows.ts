import type { PrismaService } from "../../platform/database/prisma.service.js";
import type { StockReservationSnapshot } from "../domain/services/stock-reservations.js";

/**
 * Les réservations des réassorts lancés (R4b), relues avec l'emballé de leur
 * ligne — le reste dû se déduit de lui. Levées comprises : l'agrégat en a
 * besoin pour ne pas réserver deux fois sur un rejeu.
 *
 * 🔴 Sous verrou, à lire APRÈS le `FOR UPDATE` de `packing_stock` : l'emballé
 * d'une ligne ne s'écrit que sous ce même verrou, et READ COMMITTED relit
 * alors ce que la transaction précédente a validé.
 */
export async function reservationsOn(
  prisma: PrismaService,
  serviceDay: string,
  sku?: string,
): Promise<ReadonlyMap<string, readonly StockReservationSnapshot[]>> {
  const rows = await prisma.packingStockReservation.findMany({
    where: sku === undefined ? { serviceDay } : { serviceDay, sku },
    select: {
      sku: true,
      resupplyId: true,
      quantity: true,
      reservedAt: true,
      releasedAt: true,
      line: { select: { packed: true } },
    },
    orderBy: [{ sku: "asc" }, { resupplyId: "asc" }],
  });
  const bySku = new Map<string, StockReservationSnapshot[]>();
  for (const row of rows) {
    const list = bySku.get(row.sku) ?? [];
    list.push({
      resupplyId: row.resupplyId,
      quantity: row.quantity,
      packed: row.line.packed ?? 0,
      reservedAt: row.reservedAt,
      releasedAt: row.releasedAt,
    });
    bySku.set(row.sku, list);
  }
  return bySku;
}
