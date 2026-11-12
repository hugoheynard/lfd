import type { PayerMeansEntry } from "../services/collection-means-timeline.js";

/**
 * Port de LECTURE du moyen d'un payeur (ISP : la vue ne programme rien) —
 * ses segments, annulés compris ; vide s'il n'a jamais rien changé.
 */
export abstract class PayerCollectionMeansReader {
  abstract entriesOf(
    legalEntityId: string,
    payerCompanyId: string,
  ): Promise<readonly PayerMeansEntry[]>;
}
