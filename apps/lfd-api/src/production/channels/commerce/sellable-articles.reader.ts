/** Un article vendable, nommé et rangé — une ligne de la table des raccourcis. */
export interface SellableArticle {
  /** Le SKU PRODUIT, celui des lignes de la fiche d'atelier. */
  readonly sku: string;
  readonly name: string;
  readonly familyId: string;
  readonly familyName: string;
}

/**
 * **Les articles vendables, demandés au commerce** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, §3).
 *
 * La page « Raccourcis du fournil » liste tous les produits pour qu'on leur
 * pose des raccourcis. Or la production ne lit pas le catalogue : elle connaît
 * un article par son SKU. Elle **déclare** donc la question ici, et le
 * commerce, qui tient le miroir du référentiel, y répond — même motif que
 * {@link WorkshopShelvesReader}, et même emplacement : `lint:context-boundaries`
 * n'autorise `b2b → production` que par ce dossier.
 *
 * Port de LECTURE, étroit exprès : un nom et une famille, ni prix ni image.
 * Aucune copie côté production : un raccourci ne garde que le SKU.
 */
export abstract class SellableArticlesReader {
  /**
   * Les articles vendables — aux pros comme au public, chacun une fois —
   * dans l'ordre du catalogue : la famille, puis l'article. Une panne réelle
   * lève : la page dit qu'elle n'a pas pu lire.
   */
  abstract sellableArticles(): Promise<readonly SellableArticle[]>;
}
