import { Injectable } from "@nestjs/common";

import { PlannerFavoriteSkus } from "../../../recurring/channels/commerce/index.js";
import { ShopFavoritesReader } from "../domain/ports/shop-favorites.reader.js";

/**
 * **Les favoris d'une société, pour le planificateur** — le port qu'il
 * déclare, implémenté par la même lecture que l'onglet « Favoris » de la
 * boutique, pour l'espace de la société.
 */
@Injectable()
export class ShopFavoritesPlannerFavoriteSkus extends PlannerFavoriteSkus {
  constructor(private readonly favorites: ShopFavoritesReader) {
    super();
  }

  skusOf(companyId: string): Promise<readonly string[]> {
    return this.favorites.skusOf({ type: "company", id: companyId });
  }
}
