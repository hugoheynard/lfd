import type { PriceAudience, PriceScope } from "../price-rule.js";
import type { SaleReferenceStanding } from "../ports/sale-reference.reader.js";
import {
  SaleReferenceNotOnSaleError,
  SaleReferenceNotSoldToProsError,
  SaleReferenceNotSoldToPublicError,
  SaleReferenceWithdrawnError,
} from "../pricing-errors.js";

/**
 * **La clientèle qu'une décision vise** — `pro` (mercuriale, engagement,
 * modèle de prix, audience société ou segment, plancher pro), `public`
 * (plancher des particuliers), `any` (règle ou barème « toutes clientèles »).
 */
export type DecisionClientele = "pro" | "public" | "any";

/**
 * Une audience `segment` ou `company` ne désigne que des sociétés : elle est
 * pro. Seule `all` vise les deux clientèles.
 */
export function clienteleOfAudience(audience: PriceAudience): DecisionClientele {
  return audience.type === "all" ? "any" : "pro";
}

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
 * @throws {SaleReferenceNotSoldToProsError} décision pro, article vendu aux seuls particuliers.
 * @throws {SaleReferenceNotSoldToPublicError} décision des particuliers, article vendu aux seuls pros.
 */
export function ensureOnSale(
  requested: readonly string[],
  standings: ReadonlyMap<string, SaleReferenceStanding>,
  clientele: DecisionClientele,
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
  ensureSoldTo(asked, standings, clientele);
}

/**
 * Hugo, 2026-10-29 : une décision pro exige la vente AUX PROS ; une décision
 * « toutes clientèles » se contente d'une vente à l'une des deux.
 */
function ensureSoldTo(
  asked: readonly string[],
  standings: ReadonlyMap<string, SaleReferenceStanding>,
  clientele: DecisionClientele,
): void {
  if (clientele === "pro") {
    const publicOnly = asked.filter((sku) => standings.get(sku) === "public_only");
    if (publicOnly.length > 0) {
      throw new SaleReferenceNotSoldToProsError(publicOnly);
    }
  }
  if (clientele === "public") {
    const proOnly = asked.filter((sku) => standings.get(sku) === "pro_only");
    if (proOnly.length > 0) {
      throw new SaleReferenceNotSoldToPublicError(proOnly);
    }
  }
}
