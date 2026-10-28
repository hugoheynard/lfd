import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Le pas ou le minimum d'une vente au poids n'a pas de sens : zéro, négatif,
 * fractionnaire — ou posé sur une déclinaison vendue à la pièce, où personne
 * ne le lirait (`vente-au-poids.md`, §2).
 */
export class InvalidSaleTermsError extends DomainError {
  constructor(detail: string) {
    super("catalogue.variant.invalid_sale_terms", `Vente au poids impossible : ${detail}`);
  }
}

/**
 * L'unité de vente d'une déclinaison déjà publiée ne change plus
 * (`vente-au-poids.md`, §2 et §4.2) : des lignes de commande, des
 * factures et des historiques la lisent déjà, et le référentiel ne peut pas
 * savoir lesquels. Le geste de sortie est une autre déclinaison.
 */
export class SaleUnitFrozenError extends BusinessError {
  constructor(sku: string) {
    super(
      "catalogue.variant.sale_unit_frozen",
      `La déclinaison « ${sku} » a déjà été publiée : son unité de vente (pièce ou poids) ` +
        `ne peut plus changer. Pour la vendre autrement, créez une autre déclinaison.`,
    );
  }
}

/**
 * Une déclinaison qui suit le TARIF du défaut ne peut pas avoir une autre
 * unité que lui : elle hériterait d'un prix au kilo comme prix d'une pièce, ou
 * l'inverse.
 */
export class PricingAlignmentAcrossUnitsError extends BusinessError {
  constructor(sku: string) {
    super(
      "catalogue.variant.pricing_alignment_across_units",
      `La déclinaison « ${sku} » suivrait le tarif d'une déclinaison vendue dans une autre unité ` +
        `(pièce ou poids) : un prix au kilo deviendrait le prix d'une pièce. ` +
        `Désalignez son tarif, ou donnez-lui la même unité que la déclinaison par défaut.`,
    );
  }
}
