import type { StopDecisionOutcome, StopDecisionSource } from "@lfd/contracts";

/** La décision vivante d'un arrêt, telle que les vues la lisent. */
export interface StopDecisionRow {
  readonly stopId: string;
  readonly roundId: string;
  /** `null` : à décider. */
  readonly outcome: StopDecisionOutcome | null;
  readonly source: StopDecisionSource | null;
  readonly decidedAt: Date | null;
  /** Le nom figé à la réponse ; `""` ou `null` quand on ne le connaît pas. */
  readonly decidedByName: string | null;
}

/**
 * Port de **lecture** des décisions d'une tournée (`a-la-porte.md`, B3) —
 * pour la carte du livreur, qui les lit APRÈS avoir lu sa tournée sous son
 * mur : un identifiant de tournée qui n'est pas la sienne n'arrive jamais ici.
 */
export abstract class StopDecisionsReader {
  abstract ofRound(roundId: string): Promise<readonly StopDecisionRow[]>;
}
