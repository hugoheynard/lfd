import type { LocalMoment } from "@lfd/contracts";

import type {
  BasketAmounts,
  BasketPricingContext,
  BasketTerms,
  BasketVerdicts,
} from "../services/basket-pricing-context.js";
import { priceBasket } from "../services/price-basket.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { DraftOrderInput } from "./order-shapes.js";

/**
 * **Ce que l'agrégat reçoit pour chiffrer lui-même** (plan
 * `documentation/pricing/centime-et-tva/plan-un-seul-assemblage.md`, § 2.2,
 * lot L1a) : le panier chargé, le créneau qu'une promotion juge, et les
 * verdicts qui ont un prix. La méthode de TVA n'y est pas — c'est l'agrégat
 * qui la décide (`draft`) ou la relit (`recompose`).
 */
export interface OrderPricingRequest {
  readonly context: BasketPricingContext;
  readonly handoverAt: LocalMoment | null;
  readonly verdicts: BasketVerdicts;
}

/**
 * Une commande à composer **sans montants** : son identité, et de quoi les
 * calculer. L'argent (`BasketTerms`) n'y figure pas — il sort de
 * `priceBasket`, appelé par l'agrégat, jamais d'un appelant.
 */
export type PricedDraftInput = Omit<DraftOrderInput, keyof BasketTerms> & {
  readonly pricing: OrderPricingRequest;
};

/**
 * Le chiffrage que l'agrégat fait de cette commande — exposé pour que
 * l'appelant lise ce que l'agrégat ne rend pas (les remises rejouées refusées
 * d'une révision, les promotions écartées au-delà de cinq) sur LE MÊME calcul,
 * mêmes entrées, même fonction.
 */
export function pricedBasketOf(
  request: OrderPricingRequest,
  vatMethod: OrderVatMethod,
): BasketAmounts {
  return priceBasket(
    request.context,
    { vatMethod, handoverAt: request.handoverAt },
    request.verdicts,
  );
}

/**
 * L'entrée complète de la composition. Une entrée chiffrée passe par
 * `priceBasket` ; une entrée aux montants déjà composés (les suites du
 * domaine qui éprouvent les gardes, les spécimens) passe telle quelle,
 * jusqu'au retrait de l'ancien code (lot L6).
 */
export function draftInputOf(
  input: DraftOrderInput | PricedDraftInput,
  vatMethod: OrderVatMethod,
): DraftOrderInput {
  if (!("pricing" in input)) {
    return input;
  }
  const { pricing, ...identity } = input;
  return { ...identity, ...pricedBasketOf(pricing, vatMethod).terms };
}
