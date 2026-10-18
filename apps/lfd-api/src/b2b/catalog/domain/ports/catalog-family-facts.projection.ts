import type { CatalogTranslations } from "../catalog-translations.js";
import type { CatalogAudience } from "../served-to.js";
import type { CatalogCategoryFacts } from "./catalog-category.projection.js";

/**
 * Une famille reçue par un fait du référentiel : les faits d'une famille, plus
 * son audience et son archivage (lot 2b) — que le push ne porte pas.
 */
export interface ReceivedCatalogFamily extends CatalogCategoryFacts {
  readonly audience: CatalogAudience;
  /** Archivée au référentiel : la plateforme pose une date, jamais une suppression. */
  readonly archived: boolean;
  /** Les traductions du nom (lot des langues) — `null` sur un fait d'avant elles. */
  readonly nameTranslations: CatalogTranslations | null;
}

/**
 * **Ce que le fait d'une famille écrit sur la plateforme** (2a4, « même
 * schéma pour la famille »). Port à part de celui de la fiche (ISP) : le
 * récepteur des familles n'écrit que des familles.
 *
 * Une famille ne se supprime jamais côté plateforme : `catalog_items` la
 * référence en cascade, et la supprimer emporterait ses articles et leurs
 * décisions (§4 bis). Archivée, elle pose `withdrawn_at` — la date du premier
 * fait qui l'a dite archivée ; restaurée, elle le remet à `NULL`.
 */
export abstract class CatalogFamilyFactsProjection {
  /**
   * Écrit la famille si ce fait est plus récent que ce qu'elle porte — ou si
   * elle n'a jamais été reçue par un fait (`applied_seq` nul : un push ou une
   * fiche l'a posée). `false` = un fait plus récent est déjà appliqué.
   */
  abstract applyIfNewer(family: ReceivedCatalogFamily, seq: number): Promise<boolean>;
}
