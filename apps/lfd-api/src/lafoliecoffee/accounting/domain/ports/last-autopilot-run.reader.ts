import type { CollectionAutopilotOutcome } from "./collection-autopilot-runs.js";

/** La dernière tentative de l'automatisme, telle que l'écran la montre. */
export interface AutopilotRunRecord {
  readonly cycleClosesAt: Date;
  readonly ranAt: Date;
  readonly outcome: CollectionAutopilotOutcome;
  readonly message: string | null;
}

/**
 * Port de **lecture pour l'écran** : la dernière tentative de l'automatisme
 * d'une entité (PA3). Séparé de {@link CollectionAutopilotRuns} : la fiche
 * de l'entité ne prend ni ne tranche aucune tentative.
 */
export abstract class LastAutopilotRunReader {
  /** La plus récente par clôture, ou `null` si l'automatisme n'a jamais tenté. */
  abstract lastOf(legalEntityId: string): Promise<AutopilotRunRecord | null>;
}
