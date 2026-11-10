/**
 * **La référence de vente de la déclinaison par défaut de chaque fiche**
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, L3).
 *
 * Pour qui désigne une FICHE — une tuile de la vitrine éditoriale, qui garde
 * la référence produit choisie dans l'éditeur — et doit la montrer sous ce que
 * la boutique vend. Les deux coïncidaient tant que le défaut se vendait sous
 * la référence produit ; depuis la bascule, le défaut se vend sous la sienne.
 * Lu au moment de servir, donc un changement de défaut suit sans réécriture.
 */
export abstract class DefaultSaleReferenceReader {
  /**
   * Référence produit → référence de vente du défaut encore en vente. Une
   * fiche inconnue, ou dont le défaut est retiré, est absente de la table.
   */
  abstract ofProducts(productSkus: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
