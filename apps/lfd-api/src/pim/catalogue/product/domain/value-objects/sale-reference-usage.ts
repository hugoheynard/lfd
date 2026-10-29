/**
 * **Où une référence de vente a déjà servi** — ce qui fige l'unité de vente
 * d'une déclinaison (`documentation/pricing/plan-changer-l-unite-de-vente.md`,
 * § 8, décision de Hugo du 2026-10-29).
 *
 * Une catégorie par lieu que le commerce tient. Le référentiel ne les lit pas
 * lui-même (`pim → b2b` est interdit) : il les reçoit du port que le commerce
 * implémente, et ne fait qu'en nommer le refus.
 */
export type SaleReferenceUse =
  | "order"
  | "order_draft"
  | "shop_cart"
  | "subscription"
  | "resupply"
  | "bundle"
  | "price_template"
  | "price_rule"
  | "price_floor"
  | "volume_ladder"
  | "mercuriale"
  | "volume_commitment";

/** Toutes les catégories, dans l'ordre où le refus les cite. */
export const SALE_REFERENCE_USES: readonly SaleReferenceUse[] = [
  "order",
  "order_draft",
  "shop_cart",
  "subscription",
  "resupply",
  "bundle",
  "price_template",
  "price_rule",
  "price_floor",
  "volume_ladder",
  "mercuriale",
  "volume_commitment",
];

/**
 * **La réponse du commerce, telle que le domaine la juge.**
 *
 * `answered: false` n'est pas « aucun usage » : personne n'a dit non n'est
 * pas un accord, et le changement d'unité est alors refusé. La cause
 * voyage pour que l'erreur levée la porte, au lieu de l'avaler.
 */
export type SaleUnitClearance =
  | { readonly answered: true; readonly uses: readonly SaleReferenceUse[] }
  | { readonly answered: false; readonly cause: unknown };

/** Les catégories sans doublon, dans l'ordre de {@link SALE_REFERENCE_USES}. */
export function orderedUses(uses: readonly SaleReferenceUse[]): readonly SaleReferenceUse[] {
  const present = new Set(uses);
  return SALE_REFERENCE_USES.filter((use) => present.has(use));
}
