import type { ProductionTrackingLevel } from "@lfd/contracts";

/** Un poste en service et son niveau de suivi propre. */
export interface WorkstationOwnTrackingLevel {
  readonly id: string;
  /** `null` : le poste suit le fournil. */
  readonly trackingLevel: ProductionTrackingLevel | null;
}

/**
 * **« Quel niveau de suivi chaque poste a-t-il réglé ? »** — la lecture que
 * les postes publient pour l'atelier, qui fige le niveau d'une journée et
 * sert celui d'une ligne (plan `fournil/plan-niveaux-de-suivi.md`, § 3.1).
 * Les postes en service seulement : un poste archivé ne porte plus de
 * produit, donc plus de ligne.
 */
export abstract class WorkstationTrackingLevels {
  abstract ofActive(): Promise<readonly WorkstationOwnTrackingLevel[]>;
}
