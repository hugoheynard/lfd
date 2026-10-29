import type { SeedLine } from "./order-placing.seed.js";

/**
 * Comment un article du miroir se vend — ce que les lignes « prises au
 * catalogue » doivent respecter pour que la passation les accepte.
 */
export interface SeedSaleTerms {
  readonly saleUnit: string;
  readonly weightStepGrams: number | null;
  readonly weightMinGrams: number | null;
  readonly proMinQuantity: number | null;
  readonly publicMinQuantity: number | null;
}

/** Les colonnes du miroir qui portent {@link SeedSaleTerms}, à recopier dans un `select`. */
export const SEED_SALE_TERMS_SELECT = {
  saleUnit: true,
  weightStepGrams: true,
  weightMinGrams: true,
  proMinQuantity: true,
  publicMinQuantity: true,
} as const;

/**
 * **Une ligne prise au catalogue, dans l'unité de l'article** (2026-10-29).
 *
 * Le semis tire certaines lignes de tout le miroir (le sac long, le catalogue
 * étalé). Depuis la vente au poids et la quantité minimale, un nombre de
 * pièces quelconque n'est plus une ligne valide partout : la passation refuse
 * un poids hors du pas ou sous le minimum, et des pièces sous le minimum de la
 * clientèle (`sale-quantity-rules.ts`). La ligne est donc posée DANS les
 * règles — jamais corrigée après coup par le serveur, qui ne corrige rien.
 *
 * - à la pièce : `base` pièces, relevées au plus grand des deux minimums —
 *   le même sac sert des pros et des particuliers ;
 * - au poids : `base` pas, relevés au minimum en grammes ;
 * - au poids sans pas : aucune ligne — la passation refuserait tout poids.
 */
export function seedLineOf(sku: string, terms: SeedSaleTerms, base: number): SeedLine | null {
  if (terms.saleUnit !== "weight") {
    const floor = Math.max(terms.proMinQuantity ?? 0, terms.publicMinQuantity ?? 0);
    return { sku, quantity: Math.max(base, floor) };
  }
  const step = terms.weightStepGrams;
  if (step === null || step <= 0) {
    return null;
  }
  const minimumSteps = Math.ceil((terms.weightMinGrams ?? 0) / step);
  return { sku, quantity: step * Math.max(base, minimumSteps, 1), saleUnit: "weight" };
}
