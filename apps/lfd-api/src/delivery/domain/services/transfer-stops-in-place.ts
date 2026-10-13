import type { DetachedStop } from "../entities/delivery-round-state.js";

/**
 * **Les arrêts de transfert gardent leur place** (plan du transfert interne,
 * §5, lot T1) quand un ordre est donné sans eux — une proposition, ou un
 * écran qui ne range que les commandes. Chaque arrêt de transfert vivant qui
 * n'est pas cité est réinséré à son rang actuel ; un ordre qui les cite tous
 * passe tel quel, et la tournée juge la permutation (I2).
 */
export function withTransferStopsInPlace(
  liveStops: readonly DetachedStop[],
  stopIds: readonly string[],
): readonly string[] {
  const cited = new Set(stopIds);
  const sequence = [...stopIds];
  liveStops.forEach((stop, index) => {
    if (stop.kind === "transfer" && !cited.has(stop.id)) {
      sequence.splice(Math.min(index, sequence.length), 0, stop.id);
    }
  });
  return sequence;
}
