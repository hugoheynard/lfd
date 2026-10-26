import type { PurgeClient, ScenarioScope } from "./scenario-scope.js";

/**
 * **La livraison du scénario** : tournées de ses journées, leurs arrêts,
 * décisions, exécutions et incidents, les bacs de ses commandes et leurs
 * chargements, le journal `day_change` de ses journées, l'ensemble des
 * livraisons connues de ses journées (`delivery_day_readiness`, CA6a) et les
 * cloches « plan arrêté » qu'il a fait sonner — et, depuis que le Village est
 * approvisionné par transfert (2026-10-14), les transferts internes de ses
 * journées, leurs éléments et leur manifeste : un transfert non parti est
 * repris d'une remise à l'autre, et ses éléments s'y empilaient.
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
 * @returns les lignes supprimées, les tournées emportées — leurs photos
 *   d'incident sont rangées sous leur identifiant — et les transferts emportés,
 *   dont le journal d'activité porte l'identifiant comme sujet.
 */
export async function purgeDelivery(
  tx: PurgeClient,
  scope: ScenarioScope,
): Promise<{
  readonly rows: number;
  readonly roundIds: readonly string[];
  readonly transferIds: readonly string[];
}> {
  const days = [...scope.days];
  const orderIds = [...scope.orderIds];
  const roundIds = (
    await tx.deliveryRound.findMany({ where: { serviceDay: { in: days } }, select: { id: true } })
  ).map((round) => round.id);
  const transferIds = (
    await tx.deliveryInternalTransfer.findMany({
      where: { serviceDay: { in: days } },
      select: { id: true },
    })
  ).map((transfer) => transfer.id);
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
    await tx.deliveryBin.deleteMany({
      where: { OR: [{ orderId: { in: orderIds } }, { transferId: { in: transferIds } }] },
    }),
    await tx.deliveryRoundStop.deleteMany({
      where: {
        OR: [
          { roundId: { in: roundIds } },
          { orderId: { in: orderIds } },
          { transferId: { in: transferIds } },
        ],
      },
    }),
    await tx.deliveryRound.deleteMany({ where: { id: { in: roundIds } } }),
    await tx.deliveryInternalTransferManifestLine.deleteMany({
      where: { transferId: { in: transferIds } },
    }),
    await tx.deliveryInternalTransferItem.deleteMany({
      where: { OR: [{ transferId: { in: transferIds } }, { orderId: { in: orderIds } }] },
    }),
    await tx.deliveryInternalTransfer.deleteMany({ where: { id: { in: transferIds } } }),
    await tx.deliveryDayChange.deleteMany({ where: { serviceDay: { in: days } } }),
    // Ses envois d'abord (plan E7 reliquat, L3c) : la table fille la tient en RESTRICT.
    await tx.deliveryDayReadinessShipment.deleteMany({ where: { serviceDay: { in: days } } }),
    await tx.deliveryDayReadiness.deleteMany({ where: { serviceDay: { in: days } } }),
    await tx.staffNotification.deleteMany({ where: planArrestedBellsOf(days) }),
  ];
  return { rows: counts.reduce((total, { count }) => total + count, 0), roundIds, transferIds };
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
