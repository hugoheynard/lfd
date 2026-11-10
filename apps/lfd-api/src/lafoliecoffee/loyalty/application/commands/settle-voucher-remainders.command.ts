/**
 * **Le rattrapage des bons engagés** (plan des points, C5 et §11 bis S4),
 * joué chaque nuit après celui des gains :
 *
 * - une commande **payée** dont le bon n'a pas de reliquat le reçoit — la
 *   commande est définitive, elle ne peut plus être annulée ;
 * - une commande ni payée ni annulée **passé son jour de service** sonne à la
 *   cloche du back-office. Le bon n'est PAS libéré : une commande refusée se
 *   reprend, et la libérer ouvrirait la double dépense (D7).
 */
export class SettleVoucherRemaindersCommand {}

/** Le compte rendu du passage. */
export interface VoucherRemaindersReport {
  /** Bons engagés et non soldés, parcourus. */
  readonly reserved: number;
  /** Bons soldés sur une commande payée — reliquat émis, éteint, ou rien à émettre. */
  readonly settled: number;
  /** Bons signalés à l'équipe : leur commande reste en suspens. */
  readonly stalled: number;
}
