import type { ShopCatalogueView, ShopItemView, ShopShelfView } from "@lfd/contracts";

import type { ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";

/**
 * **Ce qu'une vitrine montre, et comment ça se range** — sans un seul prix
 * résolu.
 *
 * Ce fichier a été extrait du handler de la route publique le 2026-09-09, et
 * pas par goût du rangement : `ShopCataloguePricing` en a besoin, le handler a
 * besoin du service, et le graphe s'est refermé en cycle —
 * `lint:import-cycles` l'a vu là où `tsc`, les tests et la compilation ne
 * voyaient rien.
 *
 * Le composer ici plutôt que dans un handler dit aussi ce qu'il est : la
 * définition de « ce que la vitrine montre », partagée par les deux routes.
 * Deux définitions auraient divergé au premier article retiré — et une boutique
 * qui montre à un client un article que l'autre ne voit pas est le genre
 * d'écart qu'on ne découvre qu'au téléphone.
 */

/** Les articles vendables et leurs rayons, au **tarif** — le prix vient après. */
export function shopCatalogueOf(sellable: readonly ResolvedCatalogItem[]): ShopCatalogueView {
  const items = sellable.filter((item) => item.isDefault).map(toItem);
  return { shelves: shelvesOf(sellable, items), items };
}

function toItem(item: ResolvedCatalogItem): ShopItemView {
  return {
    sku: item.productSku,
    name: item.name,
    note: item.note,
    image: item.image,
    // Le prix EFFECTIF — celui du B2B s'il a été décidé, celui du référentiel
    // sinon. C'est ce qu'un visiteur paiera, et c'est ce que la caisse
    // appliquera : les deux viennent de la même composition, faite une fois
    // dans le lecteur.
    unitPriceMillicents: item.unitPriceMillicents,
    vatRatePercent: item.vatRate,
    shelfId: item.categoryId,
    isFeatured: item.isFeatured,
  };
}

/**
 * Les rayons **réellement peuplés**, dans l'ordre du référentiel.
 *
 * Un rayon vide n'est pas une famille de moins au catalogue : c'est une
 * pastille sur laquelle un client clique pour ne rien voir. La vitrine ne
 * range que ce qu'elle montre.
 *
 * La position vient de la première occurrence : `listSellable` rend déjà les
 * articles dans l'ordre d'affichage, rayon par rayon.
 */
function shelvesOf(
  sellable: readonly ResolvedCatalogItem[],
  shown: readonly ShopItemView[],
): readonly ShopShelfView[] {
  const peopled = new Set(shown.map((item) => item.shelfId));
  const shelves = new Map<string, ShopShelfView>();
  for (const item of sellable) {
    if (!peopled.has(item.categoryId) || shelves.has(item.categoryId)) {
      continue;
    }
    shelves.set(item.categoryId, {
      id: item.categoryId,
      name: item.categoryName,
      position: shelves.size,
    });
  }
  return [...shelves.values()];
}
