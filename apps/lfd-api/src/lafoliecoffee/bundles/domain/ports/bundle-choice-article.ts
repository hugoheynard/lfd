/**
 * Ce qu'un article est **pour une formule** (§4.2 du plan) :
 *
 * - `admissible` — servi au public en ce moment, et pas réservé aux opérations ;
 * - `not_served_to_public` — `servedTo(item, "public")` dit non : réservé aux
 *   pros, masqué, ou en attente de validation ;
 * - `operation_only` — servi, mais il ne se vend que pendant une opération.
 */
export type BundleChoiceVerdict = "admissible" | "not_served_to_public" | "operation_only";

/** Un article du catalogue, vu par l'écran des formules. */
export interface BundleChoiceArticle {
  readonly sku: string;
  readonly name: string;
  /** Le rayon — la famille de l'article, telle que la boutique la nomme. */
  readonly shelf: string;
  /** La vignette de rayon, sinon le packshot ; `null` = aucune image. */
  readonly thumbnailUrl: string | null;
  readonly verdict: BundleChoiceVerdict;
}
