import {
  BusinessError,
  DomainError,
  TechnicalError,
} from "../../../../../platform/shared/errors/app-error.js";
import { orderedUses, type SaleReferenceUse } from "../value-objects/sale-reference-usage.js";

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

/** Ce que dit le refus, catégorie par catégorie — lu par du personnel, pas par du code. */
const USE_LABELS: Readonly<Record<SaleReferenceUse, string>> = {
  order: "déjà commandée",
  order_draft: "dans un brouillon de commande",
  shop_cart: "dans un panier de la boutique",
  subscription: "dans un abonnement",
  resupply: "dans un réassort",
  bundle: "dans un lot",
  price_template: "dans un gabarit tarifaire",
  price_rule: "visée par une règle de prix",
  price_floor: "visée par un plancher",
  volume_ladder: "visée par un barème de volume",
  mercuriale: "porte une mercuriale",
  volume_commitment: "visée par un engagement de volume",
};

/** Le libellé d'une catégorie d'usage — partagé par le refus et l'écran. */
export function saleReferenceUseLabel(use: SaleReferenceUse): string {
  return USE_LABELS[use];
}

/**
 * L'unité de vente d'une déclinaison dont la référence a déjà servi ne change
 * plus (`plan-changer-l-unite-de-vente.md`, § 8, Hugo, 2026-10-29) : des
 * commandes, des décisions tarifaires ou des paniers la lisent dans son unité
 * actuelle, et aucune conversion n'existe entre un prix à la pièce et un prix
 * au kilo. Le geste de sortie est une autre déclinaison.
 *
 * Remplace `SaleUnitFrozenError`, qui figeait l'unité dès la première
 * publication, même sans aucune vente.
 */
export class SaleReferenceInUseError extends BusinessError {
  constructor(sku: string, uses: readonly SaleReferenceUse[]) {
    super(
      "catalogue.variant.sale_unit_in_use",
      `La déclinaison « ${sku} » a déjà servi (${orderedUses(uses).map(saleReferenceUseLabel).join(", ")}) : ` +
        `son unité de vente (pièce ou poids) ne peut plus changer. ` +
        `Créez une autre déclinaison pour la vendre autrement.`,
    );
  }
}

/**
 * Le commerce n'a pas pu dire si la référence a servi. Le changement d'unité
 * est refusé : « personne n'a dit non » ne vaut pas accord.
 */
export class SaleReferenceUsageUnknownError extends TechnicalError {
  constructor(sku: string, cause: unknown) {
    super(
      "catalogue.variant.sale_unit_usage_unknown",
      `Impossible de vérifier si la déclinaison « ${sku} » a déjà servi (commandes, tarifs, paniers) : ` +
        `son unité de vente n'a pas été changée. Réessayez dans un instant ; si le refus persiste, ` +
        `signalez-le à l'équipe technique.`,
      cause,
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
