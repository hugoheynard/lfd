import type {
  ApplyDeliveryProposalPayload,
  DeliveryRoundProposalView,
  TimeDeliveryRoundsPayload,
} from '@lfd/contracts';

import type { PlannedRound } from './delivery-planning';

/**
 * Ce que l'écran « Planifier » ENVOIE au serveur — chronométrer, appliquer —
 * construit à partir de la composition locale. Sorti de
 * `delivery-planning.ts`, qui garde la composition elle-même.
 */

/**
 * Ce que « chronométrer » reçoit : les colonnes `keys`, dans l'ordre, sans
 * celles qu'un glisser a vidées — le contrat veut au moins une commande par
 * tournée, et une tournée vide n'a pas d'heures.
 */
export function timingPayloadOf(
  day: string,
  rounds: readonly PlannedRound[],
  keys: readonly string[],
): TimeDeliveryRoundsPayload | null {
  const chosen = rounds.filter((round) => keys.includes(round.key) && round.stops.length > 0);
  if (chosen.length === 0) {
    return null;
  }
  return {
    day,
    rounds: chosen.map((round) => ({
      roundId: round.roundId,
      vehicleId: round.vehicleId,
      orderIds: round.stops.map((stop) => stop.orderId),
    })),
  };
}

/**
 * Ce qu'« Appliquer » renvoie : la composition ÉDITÉE, avec les versions de
 * toutes les tournées lues (L10b-C2, même contrat que le lot 7). Une tournée
 * gardée n'y figure que si on y a touché ; une tournée à ouvrir qu'on a vidée
 * n'est pas ouverte. Une existante vidée part vide : c'est ce qu'on a vu.
 */
export function applyPayloadOfPlan(
  proposal: DeliveryRoundProposalView,
  rounds: readonly PlannedRound[],
): ApplyDeliveryProposalPayload {
  return {
    day: proposal.day,
    rounds: rounds
      .filter((round) => round.lock === null && (!round.kept || round.touched))
      .filter((round) => round.roundId !== null || round.stops.length > 0)
      .map((round) => ({
        roundId: round.roundId,
        vehicleId: round.vehicleId,
        orderIds: round.stops.map((stop) => stop.orderId),
      })),
    versions: proposal.versions.map(({ roundId, version }) => ({ roundId, version })),
  };
}
