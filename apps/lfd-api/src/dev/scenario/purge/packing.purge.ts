import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **Le colisage des journées du scénario** — ses copies des commandes, ses
 * contenants, son stock, ses réceptions et retours, et son journal
 * `day_change`. Tout est clé par journée : le colisage tient ses journées sans
 * clé vers le fournil (la frontière, voulue).
 *
 * Enfants d'abord : lignes et contenants tiennent leur commande en `Restrict`.
 */
export async function purgePacking(tx: PurgeClient, scope: ScenarioScope): Promise<number> {
  const ofDays = { serviceDay: { in: [...scope.days] } };
  const counts = [
    await tx.packingLine.deleteMany({ where: ofDays }),
    await tx.packingContainerLine.deleteMany({ where: ofDays }),
    await tx.packingContainer.deleteMany({ where: ofDays }),
    await tx.packingOrder.deleteMany({ where: ofDays }),
    await tx.packingStock.deleteMany({ where: ofDays }),
    await tx.packingReceipt.deleteMany({ where: ofDays }),
    await tx.packingReturn.deleteMany({ where: ofDays }),
    await tx.packingDayChange.deleteMany({ where: ofDays }),
  ];
  return counts.reduce((total, { count }) => total + count, 0);
}
