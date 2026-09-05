import type { ShopCatalogueView, ShopItemView, ShopShelfView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CatalogReader, type ResolvedCatalogItem } from "../../domain/ports/catalog.reader.js";

/**
 * **Ce qui est en vente**, pour une vitrine publique.
 *
 * Une lecture nommée plutôt qu'un port injecté dans le contrôleur : elle a un
 * cas d'usage — hydrater la boutique — et il doit se tester, se réutiliser et se
 * journaliser sans passer par HTTP.
 */
export class ReadShopCatalogueQuery {}

@QueryHandler(ReadShopCatalogueQuery)
export class ReadShopCatalogueHandler implements IQueryHandler<ReadShopCatalogueQuery> {
  constructor(private readonly catalog: CatalogReader) {}

  /**
   * Le catalogue vendable, réduit à ce qu'une vitrine montre.
   *
   * 🔴 **`listSellable` et rien d'autre.** Elle porte déjà la définition de « ce
   * qui se vend » — pas retiré, pas masqué, un taux de TVA connu — et la
   * réécrire ici en donnerait une seconde, qui dériverait le jour où l'une des
   * trois conditions bouge. Un article vendu par la vitrine que la caisse
   * refuse est le pire des deux mondes.
   *
   * Seules les déclinaisons **par défaut** sortent, sous le SKU de leur produit.
   * C'est ce que la boutique vend depuis l'ouverture commerciale et ce
   * qu'acceptent `POST /orders` et le devis : exposer les SKU du référentiel
   * rendrait un panier que la caisse ne sait pas lire.
   */
  async execute(): Promise<ShopCatalogueView> {
    const sellable = await this.catalog.listSellable();
    const items = sellable.filter((item) => item.isDefault).map(toItem);
    return { shelves: shelvesOf(sellable, items), items };
  }
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
