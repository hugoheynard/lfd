import type { PriceScope } from "../price-rule.js";
import type { SaleReferenceStanding } from "../ports/sale-reference.reader.js";
import { SaleReferenceNotOnSaleError, SaleReferenceWithdrawnError } from "../pricing-errors.js";

/**
 * **La référence qu'une portée vise**, ou `null` si elle vise une famille ou
 * tout le catalogue. `product` et `variant` portent tous deux un SKU de vente
 * depuis que le modèle est à plat (`pricing-context.ts`).
 */
export function saleReferenceOf(scope: PriceScope): string | null {
  return scope.type === "product" || scope.type === "variant" ? scope.id : null;
}

/**
 * **Une décision tarifaire ne vise que ce qui se vend**
 * (`plan-pro-voit-les-declinaisons.md`, L5, 2026-10-29).
 *
 * Les inconnues d'abord : une faute de frappe se corrige avant de savoir
 * qu'une autre ligne vise un article retiré. Chaque refus nomme TOUTES les
 * références en cause, dans l'ordre de la saisie, pour qu'une grille de
 * quarante lignes ne se corrige pas une erreur à la fois.
 *
 * @throws {SaleReferenceNotOnSaleError} une référence n'est connue de personne.
 * @throws {SaleReferenceWithdrawnError} une référence désigne un article retiré.
 */
export function ensureOnSale(
  requested: readonly string[],
  standings: ReadonlyMap<string, SaleReferenceStanding>,
): void {
  const asked = [...new Set(requested)];
  const unknown = asked.filter((sku) => !standings.has(sku));
  if (unknown.length > 0) {
    throw new SaleReferenceNotOnSaleError(unknown);
  }
  const withdrawn = asked.filter((sku) => standings.get(sku) === "withdrawn");
  if (withdrawn.length > 0) {
    throw new SaleReferenceWithdrawnError(withdrawn);
  }
}
