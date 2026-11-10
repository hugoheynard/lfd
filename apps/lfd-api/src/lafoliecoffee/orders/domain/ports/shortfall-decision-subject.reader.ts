import type { ShortfallDecisionSubject } from "../entities/shortfall-decision.js";

/**
 * Port de **lecture** de ce que la décision du départ incomplet juge, SANS
 * verrou (lot C1b, Hugo, 2026-11-03) — à part de
 * {@link ShortfallDecisionRepository} (ISP) : l'aperçu du comptoir ne
 * verrouille ni n'écrit. Un aperçu, pas une promesse : le geste relit sous
 * le verrou de la commande.
 */
export abstract class ShortfallDecisionSubjectReader {
  /** `null` : commande inconnue. */
  abstract subjectOf(orderId: string, rank: number): Promise<ShortfallDecisionSubject | null>;
}
