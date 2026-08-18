import type { LeadView } from "@lfd/contracts";

/**
 * Port de **lecture** des leads cold (surface séparée de l'écriture, cf.
 * `LeadRepository` — ISP). Rend des vues plates prêtes à afficher côté staff.
 */
export abstract class LeadReader {
  /** Tous les leads, le plus récemment saisi en tête. */
  abstract list(): Promise<LeadView[]>;
}
