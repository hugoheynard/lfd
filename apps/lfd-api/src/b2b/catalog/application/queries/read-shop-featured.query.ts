import type { ContentLocale, ShopFeaturedAudience } from "@lfd/contracts";

/**
 * **Les incontournables d'une audience**, pour une page publique — la landing
 * `/pro` (2026-10-19). Lecture nommée : le contrôleur n'injecte que des bus.
 */
export class ReadShopFeaturedQuery {
  /**
   * @param audience `pro` seul pour l'instant.
   * @param language la langue des noms et lignes — le français par défaut à la route.
   */
  constructor(
    readonly audience: ShopFeaturedAudience,
    readonly language: ContentLocale,
  ) {}
}
