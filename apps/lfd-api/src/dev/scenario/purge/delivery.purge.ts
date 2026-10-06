import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **La livraison du scénario** : tournées de ses journées, leurs arrêts,
 * décisions, exécutions et incidents, les bacs de ses commandes et leurs
 * chargements, le journal `day_change` de ses journées, l'ensemble des
 * livraisons connues de ses journées (`delivery_day_readiness`, CA6a) et les
 * cloches « plan arrêté » qu'il a fait sonner.
 *
 * L'ensemble et sa cloche partent ensemble : laissé en place, l'ensemble
 * gardait les commandes du tour précédent, grandissait des nouvelles à chaque
 * remise, et la cloche — clé `notification:delivery.plan_arrested:<jour>:<taille>`,
 * relue dans `plan-arrested-bell.ts` le 2026-10-06 — sonnait une fois de plus
 * par tour.
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
    await tx.deliveryDayReadiness.deleteMany({ where: { serviceDay: { in: days } } }),
    await tx.staffNotification.deleteMany({ where: planArrestedBellsOf(days) }),
  ];
  return { rows: counts.reduce((total, { count }) => total + count, 0), roundIds };
}

/** Le préfixe de clé de la cloche « plan arrêté », jour compris (`plan-arrested-bell.ts`). */
const PLAN_ARRESTED_KEY = "notification:delivery.plan_arrested";

/** Les cloches « plan arrêté » des journées données — aucune si aucune journée. */
export function planArrestedBellsOf(days: readonly string[]): {
  readonly OR: { readonly idempotencyKey: { readonly startsWith: string } }[];
} {
  return {
    OR: days.map((day) => ({ idempotencyKey: { startsWith: `${PLAN_ARRESTED_KEY}:${day}:` } })),
  };
}
