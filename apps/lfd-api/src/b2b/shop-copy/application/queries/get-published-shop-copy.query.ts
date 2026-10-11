import type { ShopCopyLocale } from "../../domain/shop-copy-locale.js";

/** Query : les remplacements publiés d'une langue, pour la boutique. */
export class GetPublishedShopCopyQuery {
  constructor(readonly locale: ShopCopyLocale) {}
}
