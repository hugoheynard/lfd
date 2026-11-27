/** Un site qui suit la facturation d'une société. */
export interface InHouseBillingSite {
  readonly companyId: string;
  readonly inHouse: boolean;
}

/**
 * La nature « maison » de l'autre bout des suivis `billing` ouverts d'une
 * société : le principal qu'elle suit, et les sites qui la suivent.
 */
export interface InHouseBillingNeighbours {
  /** Le principal suivi en `billing` est-il maison ? `null` : elle règle seule. */
  readonly principalInHouse: boolean | null;
  /** Les sites qui la suivent en `billing`, et leur nature maison. */
  readonly sites: readonly InHouseBillingSite[];
}

/**
 * Port de **lecture** des voisins de facturation, que le marquage « maison »
 * lit pour garder une même nature des deux côtés d'un suivi `billing`
 * (`restaurants-maison.md`). Étroit : il ne rend que des natures.
 */
export abstract class InHouseBillingNeighboursReader {
  /** Les voisins à l'instant `at` (périodes qui le couvrent, début inclus, fin exclue). */
  abstract neighboursOf(companyId: string, at: Date): Promise<InHouseBillingNeighbours>;
}
