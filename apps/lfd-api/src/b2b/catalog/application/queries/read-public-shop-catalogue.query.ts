import type { ContentLocale } from "@lfd/contracts";

import type { ShopAudience } from "../../domain/ports/catalog.reader.js";

/**
 * **La vitrine de `GET /shop/catalogue`, et si Workers Cache peut la garder**
 * (C3, `plan-cache-du-catalogue.md` § 3). La même lecture que
 * `ReadShopCatalogueQuery` — que la vitrine de l'agence relit sans cache —,
 * entourée de la décision de cacheabilité.
 */
export class ReadPublicShopCatalogueQuery {
  constructor(
    readonly language: ContentLocale,
    readonly audience: ShopAudience,
  ) {}
}
