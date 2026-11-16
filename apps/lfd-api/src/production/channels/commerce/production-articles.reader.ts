import type { CatalogFamilyView } from "@lfd/contracts";

/** Un article tel que le fournil le range : sa déclinaison, son produit, son rayon. */
export interface ProductionArticle {
  /** La référence de la déclinaison — celle des lignes du fournil. */
  readonly sku: string;
  /** La référence du produit, que toutes ses déclinaisons partagent : la clé d'un poste. */
  readonly productSku: string;
  /** `null` : le référentiel n'a pas envoyé de nom de fiche — l'écran dit `variantName`. */
  readonly productName: string | null;
  /** Le nom servi de la déclinaison (« fiche — déclinaison » hors défaut). */
  readonly variantName: string;
  /** Son rayon de boutique, lignée comprise. */
  readonly family: CatalogFamilyView;
  /** Vendue aujourd'hui à au moins une clientèle — la règle même de la vente. */
  readonly sellable: boolean;
}

/**
 * **Le produit et le rayon de ce que le fournil fabrique**, demandés au
 * commerce **sans les filtres de vente** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.4).
 *
 * Un poste s'attache au PRODUIT, et le fournil ne connaît que le SKU de ses
 * lignes : il lui faut la référence produit de chaque déclinaison, masquée
 * ou sans taux comprise — une quiche 6 parts masquée suit le poste de son
 * produit, et un produit masqué mais fabriqué peut recevoir un poste. Une
 * déclinaison **retirée** n'est pas rendue.
 *
 * Un port à part et non une méthode de plus sur {@link WorkshopShelvesReader}
 * (ISP) : le mode boutique ne lit que le rayon, filtres de vente compris, et
 * n'a pas à changer.
 *
 * Il vit dans `channels/commerce/` : la production le déclare, le commerce
 * l'implémente, `appBootstrap` les relie.
 */
export abstract class ProductionArticlesReader {
  /**
   * L'article de chaque SKU demandé. Un SKU absent du miroir ou retiré est
   * **absent** de la table. Une panne réelle lève.
   */
  abstract articlesOf(skus: readonly string[]): Promise<ReadonlyMap<string, ProductionArticle>>;

  /** Tous les articles du miroir, déclinaisons et masqués compris, dans l'ordre du catalogue. */
  abstract allArticles(): Promise<readonly ProductionArticle[]>;
}
