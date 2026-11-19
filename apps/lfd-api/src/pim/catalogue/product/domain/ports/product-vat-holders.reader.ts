/**
 * **Combien de fiches dérogent avec un taux** — ce que la fiche publie pour
 * qu'un taux sache s'il sert, sans lire ses tables.
 */
export abstract class ProductVatHoldersReader {
  /** Les dérogations qui portent ce taux, tous contextes confondus (une ligne par contexte). */
  abstract countHolding(rateId: string): Promise<number>;
}
