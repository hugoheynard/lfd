import type { CatalogCategory, OrderLimitSpec, OrderLineAllergens } from "@lfd/contracts";

import type { CatalogArticle } from "../catalogue-article.js";
import type { ShopAudience } from "./catalog.reader.js";

/** Ce que le seed porte pour un SKU : nom + prix unitaire **HT** en millicentimes. */
export interface PricedSku {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceMillicents: number;
}

/** Un article du catalogue, tel que le checkout en a besoin. Prix unitaire **HT**. */
export interface CatalogItem extends PricedSku {
  /** Taux de TVA du **produit** en %, ex. 5.5 (alimentaire) ou 20 (non-alimentaire). */
  readonly vatRate: number;
  /**
   * Sa famille — ce par quoi un écran range 92 produits en cinq rayons.
   *
   * `null` = la famille du PIM n'a pas de rayon (panne du 2026-09-26) :
   * l'article reste vendable et tarifé, sans aucune décision de famille. Jamais
   * un rayon par défaut — un rayon faux ferait mordre les règles d'une autre
   * famille.
   */
  readonly category: CatalogCategory | null;
  /**
   * **Ce qui est déclaré**, au moment où l'on résout la ligne.
   *
   * Transporté jusqu'ici pour être FIGÉ sur la commande, comme le prix l'est
   * déjà : sans lui, plus rien ne dit sous quelle déclaration une commande a
   * été passée dès qu'une livraison suivante la corrige.
   *
   * `null` = l'article n'en porte pas — une donnée reçue avant que le fil ne
   * les transporte. Une absence, jamais « aucun allergène ».
   */
  readonly allergens: OrderLineAllergens | null;
  /**
   * **Jusqu'à quand on prend commande de cet article**, résolu par le
   * référentiel et reçu par le fil.
   *
   * `null` = il n'en déclare aucune, et c'est alors la règle du commerce qui
   * s'applique. Indistinguable — volontairement — d'un article reçu avant que le
   * fil ne transporte les limites : dans les deux cas, on retombe sur la règle
   * du commerce, ce qui est le comportement d'hier.
   */
  readonly orderTimeLimit: OrderLimitSpec | null;
  /**
   * **Ce qu'il faut pour le tarifer, scellé par le catalogue.**
   *
   * Frappé par l'adaptateur, donc porteur de la preuve que son
   * `canonicalMillicents` a été **lu** et non reçu. C'est ce que le tarificateur
   * exige : un article construit à la main ne lui est plus assignable.
   *
   * 🔴 Le champ existe pour que la traduction — `unitPriceMillicents` du
   * catalogue → `canonicalMillicents` du moteur — se fasse **une** fois. Elle
   * était recopiée sur six sites au 2026-09-09.
   */
  readonly article: CatalogArticle;
}

/**
 * Un article de catalogue **avant sa frappe** — ce qu'une suite déclare.
 *
 * Le sceau se pose au bord du contexte, jamais dans la fixture : un double qui
 * rendrait un article non scellé éprouverait un monde que la production ne peut
 * pas produire, et cesserait d'être substituable à la source.
 */
export type UnsealedCatalogItem = Omit<CatalogItem, "article">;

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
  abstract resolve(sku: string, audience: ShopAudience): Promise<CatalogItem | null>;

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
  abstract resolveMany(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, CatalogItem>>;
}
