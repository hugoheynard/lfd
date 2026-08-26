/**
 * Contrat de fil des **points de vente** — d'où l'on vend.
 *
 * Aucun schéma Zod : la surface est en **lecture seule** (p-0). Les boutiques
 * s'écrivent encore par le contrat des emplacements, la plateforme ne s'écrit
 * nulle part.
 */

/** `shop` = boutique physique ; `platform` = plateforme de commande (le B2B). */
export type PointOfSaleKindView = "shop" | "platform";

/** Vue d'un point de vente telle que l'API la rend. */
export interface PointOfSaleView {
  readonly id: string;
  readonly kind: PointOfSaleKindView;
  readonly label: string;
  /** Boutique seulement — `null` pour une plateforme. */
  readonly baseUrl: string | null;
  /** Les clés de contexte qu'il OFFRE ; ce qu'on y vend est une autre question. */
  readonly contexts: readonly string[];
}
