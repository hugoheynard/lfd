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
  /** Résout un SKU, ou `null` s'il est inconnu du catalogue. */
  abstract resolve(sku: string): CatalogItem | null;

  /**
   * Le catalogue entier, dans l'ordre où il se parcourt.
   *
   * Ajouté pour le back-office, qui doit **montrer** ce que le checkout se
   * contente de résoudre. La seule autre façon d'y arriver aurait été une
   * quatrième copie de la table des produits, dans l'app admin — donc un écran
   * où le commercial annonce au téléphone un prix que le serveur refuse ensuite.
   */
  abstract all(): readonly CatalogItem[];
}
