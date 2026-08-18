import type { CatalogCategory } from "@lfd/contracts";

/** Ce que le seed porte pour un SKU : nom + prix unitaire **HT** en centimes. */
export interface PricedSku {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
}

/** Un article du catalogue, tel que le checkout en a besoin. Prix unitaire **HT**. */
export interface CatalogItem extends PricedSku {
  /** Taux de TVA du **produit** en %, ex. 5.5 (alimentaire) ou 20 (non-alimentaire). */
  readonly vatRate: number;
  /** Sa famille — ce par quoi un écran range 92 produits en cinq rayons. */
  readonly category: CatalogCategory;
}

/**
 * Port de **lecture** du catalogue — l'autorité de prix au checkout.
 *
 * Le client n'envoie qu'un `sku` et une quantité : c'est ici que le serveur
 * résout le nom et le prix réels. Ne jamais faire confiance au prix envoyé par le
 * client. Source jetable (seed) jusqu'à la vraie synchro PIM.
 */
export abstract class ProductCatalogReader {
  /**
   * Résout un SKU, ou `null` s'il est inconnu du catalogue.
   *
   * **Asynchrone**, et c'est la bascule du catalogue qui l'impose : lire une
   * base l'est. Le port a longtemps été synchrone parce que sa seule
   * implémentation était une table en dur ; garder cette signature aurait
   * obligé l'adaptateur Postgres à servir un instantané tenu en mémoire, donc à
   * facturer un prix périmé dès qu'un autre pod reçoit une poussée du PIM. Sur
   * l'autorité de prix du checkout, c'était le mauvais compromis.
   */
  abstract resolve(sku: string): Promise<CatalogItem | null>;

  /**
   * Le catalogue entier, dans l'ordre où il se parcourt.
   *
   * Ajouté pour le back-office, qui doit **montrer** ce que le checkout se
   * contente de résoudre. La seule autre façon d'y arriver aurait été une
   * quatrième copie de la table des produits, dans l'app admin — donc un écran
   * où le commercial annonce au téléphone un prix que le serveur refuse ensuite.
   */
  abstract all(): Promise<readonly CatalogItem[]>;

  /**
   * Résout **plusieurs** SKU en une lecture.
   *
   * Le chemin qui facture résout toutes les lignes d'un panier ; la liste des
   * habitudes en résout des dizaines. Tant que le catalogue était une table en
   * mémoire, les résoudre un par un ne coûtait rien — depuis qu'il vient de la
   * base, c'est une requête par ligne. Un SKU inconnu est **absent** de la table
   * rendue, jamais présent à `null`.
   */
  abstract resolveMany(skus: readonly string[]): Promise<ReadonlyMap<string, CatalogItem>>;
}
