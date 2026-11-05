import type { ContentLocale, ShopFeaturedAudience } from "@lfd/contracts";

/**
 * **Les incontournables de `GET /shop/featured`, et si Workers Cache peut les
 * garder** (C3, `le-rayon-en-cache.md` § 3).
 */
export class ReadPublicShopFeaturedQuery {
  constructor(
    readonly audience: ShopFeaturedAudience,
    readonly language: ContentLocale,
  ) {}
}
