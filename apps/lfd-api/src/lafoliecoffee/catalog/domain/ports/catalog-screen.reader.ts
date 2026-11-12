import type { CatalogScreenItemView } from "@lfd/contracts";

import type { PublishedCatalogSource } from "./published-catalog.reader.js";

/** Ce que l'écran Catalogue lit : la source de la vue publiée et les lignes de paramétrage. */
export interface CatalogScreenSource {
  readonly published: PublishedCatalogSource;
  /** Les articles en vente, dans l'ordre du paramétrage (rayon, position, SKU). */
  readonly items: readonly CatalogScreenItemView[];
}

/**
 * **Port de lecture de l'écran Catalogue du back-office**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 4.1–4.2).
 *
 * Distinct de `PublishedCatalogReader` et de `CatalogAdminReader` (ISP) : il
 * rassemble ce que les deux lisent, en lisant les articles UNE fois, sans les
 * auteurs des décisions ni le compte des réservations — d'autres écrans
 * (Mise en avant, Promotions, fiche client) lisent toujours les deux autres.
 */
export abstract class CatalogScreenReader {
  /** Tout l'écran : fiches, articles en vente, familles. */
  abstract read(): Promise<CatalogScreenSource>;

  /**
   * Les FICHES des articles nommés, entières : toutes leurs déclinaisons en
   * vente et leur entrée reçue, avec toutes les familles (la remontée des
   * parentes les lit). Un SKU qui n'est plus en vente ne ramène rien.
   */
  abstract readProductsOf(skus: readonly string[]): Promise<CatalogScreenSource>;
}
