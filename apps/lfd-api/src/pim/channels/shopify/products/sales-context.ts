import type { CategoryTvaTags } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";

/**
 * Un **contexte de vente** — une manière de vendre l'article qui a son propre traitement
 * de TVA (donc sa propre collection `tva-*`). Voir
 * `documentation/lfc/projection-sales-context.md`.
 *
 * `handleSuffix` = suffixe de handle Shopify du contexte ; **vide pour le contexte par
 * défaut** (handle nu → migration nulle sur l'existant). `pick` choisit, dans les tags
 * résolus de la catégorie, celui de ce contexte.
 */
export interface SalesContext {
  readonly key: string;
  readonly handleSuffix: string;
  readonly pick: (tags: CategoryTvaTags) => string | null;
}

/**
 * Les contextes **actifs** aujourd'hui — un seul : `emporter`. Ajouter « sur place »
 * ou « B2B » se fait ici (+ leur `pick`), sans toucher au reste du pipeline. L'ordre
 * compte : le premier est le contexte par défaut (handle nu).
 */
export const ACTIVE_SALES_CONTEXTS: readonly SalesContext[] = [
  { key: "emporter", handleSuffix: "", pick: (tags) => tags.emporter },
];
