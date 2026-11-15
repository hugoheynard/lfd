import type { QualityLineStatus } from "@lfd/contracts";

import type { ProductionDay } from "../../day/index.js";

/**
 * **Ce que l'atelier sait des retenues qualité** : la pastille de chaque ligne
 * contrôlée de la journée — le verdict courant de son SKU, et s'il est périmé
 * par un compte qui a bougé. La qualité publie ce port ; l'atelier ne lit ni
 * ses contrôles, ni ses règles de verdict (plan de découpage du fournil, § 3).
 *
 * Étroit à dessein (ISP) : la fiche n'a besoin que des lignes, pas des
 * commandes retenues ni des photos.
 */
export abstract class QualityLineStatusReader {
  /**
   * Les pastilles des lignes de cette journée, triées par SKU — les mêmes que
   * la Supervision. La journée est passée entière : un verdict se périme
   * contre la quantité ACTUELLE de son compte.
   */
  abstract linesOf(day: ProductionDay): Promise<readonly QualityLineStatus[]>;
}
