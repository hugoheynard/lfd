import type { CatalogCategoryFacts } from "./catalog-category.projection.js";

/**
 * **Ce que le fait d'une famille écrit sur la plateforme** (2a4, « même
 * schéma pour la famille »). Port à part de celui de la fiche (ISP) : le
 * récepteur des familles n'écrit que des familles.
 *
 * Une famille ne se supprime jamais côté plateforme : `catalog_items` la
 * référence en cascade, et la supprimer emporterait ses articles et leurs
 * décisions (§4 bis).
 */
export abstract class CatalogFamilyFactsProjection {
  /**
   * Écrit la famille si ce fait est plus récent que ce qu'elle porte — ou si
   * elle n'a jamais été reçue par un fait (`applied_seq` nul : un push ou une
   * fiche l'a posée). `false` = un fait plus récent est déjà appliqué.
   */
  abstract applyIfNewer(family: CatalogCategoryFacts, seq: number): Promise<boolean>;
}
