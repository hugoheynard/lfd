import type { CatalogCategory } from "@lfd/contracts";

import { UnknownCatalogShelfError } from "./errors/unknown-catalog-shelf.error.js";

/**
 * **Le rayon d'une famille du PIM.**
 *
 * Le PIM range en familles (`cat_vien`), la boutique range en rayons
 * (`viennoiserie`). Les deux vocabulaires ne se déduisent pas l'un de l'autre :
 * il faut une table, et elle est ici, explicite, plutôt que devinée d'un préfixe
 * de SKU comme le faisait le seed.
 *
 * La correspondance a été vérifiée sur la donnée avant la bascule — les
 * effectifs coïncident un pour un (19 / 18 / 18 / 24 / 13). Ce n'est pas une
 * hypothèse, c'est un constat.
 *
 * ⚠️ Le rayon est une **union fermée** dans les contrats : tant qu'elle l'est,
 * une famille inédite poussée par le PIM n'a pas de rayon, et c'est un refus
 * explicite plutôt qu'un article rangé au hasard.
 *
 * ## Pourquoi elle vit ici et non dans `orders/`
 *
 * Elle y a vécu tant qu'un seul lecteur en avait besoin : l'autorité de prix du
 * checkout. **Depuis le 2026-09-09, la vitrine tarife aussi** — c'est R22 — et
 * elle ne peut pas atteindre `orders/` sans cycle, `OrdersModule` important déjà
 * `CatalogModule`.
 *
 * Elle est donc descendue là d'où vient son **entrée** : la famille est une
 * donnée du catalogue, dont ce contexte tient déjà le miroir
 * (`CatalogCategoryProjection`). Le duplicat aurait été le pire choix — deux
 * tables de rayons qui divergent, ce sont deux prix pour le même article.
 */
const SHELF_BY_PIM_CATEGORY: Readonly<Record<string, CatalogCategory>> = {
  cat_vien: "viennoiserie",
  cat_pains: "pain",
  cat_patis: "patisserie",
  cat_sale: "sale",
  cat_choco: "chocolat",
};

/**
 * Le rayon d'un article, ou un **refus**.
 *
 * 🔴 Jamais de rayon par défaut. Un rayon faux ferait appliquer à l'article les
 * règles de prix d'une **autre** famille — une règle « −10 % sur la
 * viennoiserie » mordant sur du chocolat —, et rien ne le signalerait avant la
 * facture. C'est la seule fonction du dépôt qui traduit ces deux vocabulaires,
 * et c'est ce qui garde la vitrine et la caisse d'accord sur ce qu'est une
 * famille.
 *
 * @throws {UnknownCatalogShelfError} la famille du PIM n'a pas de rayon.
 */
export function shelfOfCategory(sku: string, categoryId: string): CatalogCategory {
  const shelf = SHELF_BY_PIM_CATEGORY[categoryId];
  if (shelf === undefined) {
    throw new UnknownCatalogShelfError(sku, categoryId);
  }
  return shelf;
}
