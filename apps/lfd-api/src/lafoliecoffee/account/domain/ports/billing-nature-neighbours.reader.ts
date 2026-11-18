/**
 * Les formes juridiques de l'autre bout des suivis `billing` ouverts d'une
 * société : le principal qu'elle suit, et les sites qui la suivent.
 */
export interface BillingNatureNeighbours {
  /** La forme du principal suivi en `billing`, ou `null` si elle règle seule. */
  readonly principalForm: string | null;
  /** Les formes des sites qui la suivent en `billing`. */
  readonly siteForms: readonly string[];
}

/**
 * Port de **lecture** des voisins de facturation d'une société, que la
 * correction d'identité lit pour garder une même nature (entreprise ou
 * organisme public) des deux côtés d'un suivi `billing`. Un port étroit : la
 * correction ne demande que des formes, jamais les périodes.
 */
export abstract class BillingNatureNeighboursReader {
  /** Les voisins à l'instant `at` (périodes qui le couvrent, début inclus, fin exclue). */
  abstract neighboursOf(companyId: string, at: Date): Promise<BillingNatureNeighbours>;
}
