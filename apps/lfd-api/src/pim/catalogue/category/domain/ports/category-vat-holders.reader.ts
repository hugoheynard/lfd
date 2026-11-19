/**
 * **Combien de familles portent un taux** — ce que la famille publie pour
 * qu'un taux sache s'il sert, sans lire ses tables.
 */
export abstract class CategoryVatHoldersReader {
  /** Les familles qui portent ce taux, tous contextes confondus (une ligne par contexte). */
  abstract countHolding(rateId: string): Promise<number>;
}
