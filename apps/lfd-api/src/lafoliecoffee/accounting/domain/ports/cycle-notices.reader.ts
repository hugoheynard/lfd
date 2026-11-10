import type { CycleNotice } from "../services/collection-notice-plan.js";

/**
 * Les avis déjà écrits pour un cycle d'une entité — ce qu'une reconstitution
 * relit pour savoir quoi rectifier ou annuler (PA2). Lu sous le verrou de la
 * constitution, dans sa transaction.
 */
export abstract class CycleNoticesReader {
  /** Dans l'ordre d'écriture (identifiant ULID croissant). */
  abstract ofCycle(legalEntityId: string, cycleClosesAt: Date): Promise<readonly CycleNotice[]>;
}
