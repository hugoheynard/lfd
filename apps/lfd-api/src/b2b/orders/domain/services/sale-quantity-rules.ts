import { MAX_LINE_WEIGHT_GRAMS } from "@lfd/contracts";

import {
  SaleUnitMismatchError,
  WeightAboveGuardError,
  WeightArticleWithoutStepError,
  WeightBelowMinimumError,
  WeightOffStepError,
} from "../errors/sale-quantity-errors.js";

/** Comment un article se vend — ce contre quoi une quantité se valide. */
export interface ArticleSaleTerms {
  readonly sku: string;
  readonly saleUnit: "piece" | "weight";
  /** Au poids : le minimum en grammes, `null` = aucun. */
  readonly weightMinGrams: number | null;
  /** Au poids : le pas de saisie en grammes. */
  readonly weightStepGrams: number | null;
}

/** Une quantité demandée, dans l'unité que la ligne déclare. */
export interface RequestedQuantity {
  readonly quantity: number;
  readonly saleUnit: "piece" | "weight";
}

/**
 * **Une quantité se lit-elle dans l'unité de l'article ?**
 * (`documentation/pricing/vente-au-poids.md`, §2, P3)
 *
 * - l'unité de la ligne est celle de l'article — jamais de conversion ;
 * - au poids : un multiple du pas, au moins le minimum s'il existe, au plus
 *   {@link MAX_LINE_WEIGHT_GRAMS} (une garde contre la faute de frappe) ;
 * - à la pièce : rien de plus ici — la borne d'une ligne est au contrat.
 *
 * Refuse, ne corrige jamais : un poids ramené au pas serait un autre prix que
 * celui que le client a lu.
 *
 * @throws {SaleUnitMismatchError} unité de la ligne ≠ unité de l'article.
 * @throws {WeightArticleWithoutStepError} article au poids sans pas.
 * @throws {WeightOffStepError} poids hors du pas.
 * @throws {WeightBelowMinimumError} poids sous le minimum.
 * @throws {WeightAboveGuardError} poids au-delà d'une tonne.
 */
export function ensureSaleQuantity(article: ArticleSaleTerms, requested: RequestedQuantity): void {
  if (requested.saleUnit !== article.saleUnit) {
    throw new SaleUnitMismatchError(article.sku, article.saleUnit);
  }
  if (article.saleUnit === "weight") {
    ensureWeight(article, requested.quantity);
  }
}

function ensureWeight(article: ArticleSaleTerms, weightGrams: number): void {
  if (weightGrams > MAX_LINE_WEIGHT_GRAMS) {
    throw new WeightAboveGuardError(article.sku, weightGrams, MAX_LINE_WEIGHT_GRAMS);
  }
  if (article.weightStepGrams === null) {
    throw new WeightArticleWithoutStepError(article.sku);
  }
  if (weightGrams % article.weightStepGrams !== 0) {
    throw new WeightOffStepError(article.sku, weightGrams, article.weightStepGrams);
  }
  if (article.weightMinGrams !== null && weightGrams < article.weightMinGrams) {
    throw new WeightBelowMinimumError(article.sku, weightGrams, article.weightMinGrams);
  }
}
