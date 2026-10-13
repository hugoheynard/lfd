import type { CostFn } from "../ports/distance-matrix.js";
import { compareIds } from "./compare-ids.js";
import { durationOf, type RouteClock, type RoutingStop, timeRoute } from "./route-timing.js";

/** Une tournée au dépôt candidate : ses arrêts vivants, dans l'ordre de passage. */
export interface TransferCandidateRound {
  readonly roundId: string;
  readonly stops: readonly RoutingStop[];
}

/** La place retenue : la tournée, et le nombre d'arrêts vivants avant le transfert. */
export interface TransferInsertion {
  readonly roundId: string;
  readonly after: number;
  /** Le temps de tournée ajouté, en secondes. */
  readonly addedSeconds: number;
}

/**
 * **Où insérer l'arrêt d'un transfert interne** (plan du transfert interne,
 * §5, mode intégré, lot T1) — au moindre temps de tournée ajouté, dans une
 * tournée au dépôt, SOUS la fenêtre « arrivé avant » du site.
 *
 * Une place n'est retenue que si le transfert y arrive à temps ET qu'elle
 * n'ajoute aucun retard aux arrêts déjà là : servir le village ne se paie
 * jamais du retard d'un client livré. `null` : aucune tournée ne le peut — la
 * composition ouvre alors une tournée dédiée (repli automatique, Q-T9).
 *
 * Pure et déterministe : à temps ajouté égal, la tournée d'identifiant le
 * plus petit, puis la place la plus tôt.
 */
export function cheapestTransferInsertion(input: {
  readonly depotId: string;
  readonly cost: CostFn;
  readonly clock: RouteClock;
  readonly transfer: RoutingStop;
  readonly rounds: readonly TransferCandidateRound[];
}): TransferInsertion | null {
  let best: TransferInsertion | null = null;
  const rounds = [...input.rounds].sort((a, b) => compareIds(a.roundId, b.roundId));
  for (const round of rounds) {
    const base = timeRoute(input.depotId, round.stops, input.cost, input.clock);
    for (let after = 0; after <= round.stops.length; after += 1) {
      const sequence = [
        ...round.stops.slice(0, after),
        input.transfer,
        ...round.stops.slice(after),
      ];
      const timed = timeRoute(input.depotId, sequence, input.cost, input.clock);
      if (timed.missed[after] === true || timed.lateSeconds > base.lateSeconds) {
        continue;
      }
      const addedSeconds = durationOf(timed) - durationOf(base);
      if (best === null || addedSeconds < best.addedSeconds) {
        best = { roundId: round.roundId, after, addedSeconds };
      }
    }
  }
  return best;
}
