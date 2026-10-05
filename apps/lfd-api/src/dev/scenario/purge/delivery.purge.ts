import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **La livraison du scénario** : tournées de ses journées, leurs arrêts,
 * décisions, exécutions et incidents, les bacs de ses commandes et leurs
 * chargements, le journal `day_change` de ses journées.
 *
 * Les véhicules, le point de départ, les types de bacs restent : ce sont des
 * réglages, pas des faits de la journée.
 *
 * Enfants d'abord : toutes les clés sont `Restrict`.
 *
 * @returns les lignes supprimées, et les tournées emportées — leurs photos
 *   d'incident sont rangées sous leur identifiant.
 */
export async function purgeDelivery(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<{ readonly rows: number; readonly roundIds: readonly string[] }> {
  const days = [...scope.days];
  const orderIds = [...scope.orderIds];
  const roundIds = (
    await tx.deliveryRound.findMany({ where: { serviceDay: { in: days } }, select: { id: true } })
  ).map((round) => round.id);
  const ofDayOrOrder = { OR: [{ serviceDay: { in: days } }, { orderId: { in: orderIds } }] };
  const counts = [
    await tx.deliveryStopDecision.deleteMany({ where: ofDayOrOrder }),
    await tx.deliveryStopExecution.deleteMany({ where: ofDayOrOrder }),
    await tx.deliveryIncident.deleteMany({
      where: { OR: [{ serviceDay: { in: days } }, { roundId: { in: roundIds } }] },
    }),
    await tx.deliveryBinLoad.deleteMany({
      where: { OR: [{ serviceDay: { in: days } }, { bin: { orderId: { in: orderIds } } }] },
    }),
    await tx.deliveryBin.deleteMany({ where: { orderId: { in: orderIds } } }),
    await tx.deliveryRoundStop.deleteMany({
      where: { OR: [{ roundId: { in: roundIds } }, { orderId: { in: orderIds } }] },
    }),
    await tx.deliveryRound.deleteMany({ where: { id: { in: roundIds } } }),
    await tx.deliveryDayChange.deleteMany({ where: { serviceDay: { in: days } } }),
  ];
  return { rows: counts.reduce((total, { count }) => total + count, 0), roundIds };
}
