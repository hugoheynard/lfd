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
 * `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`, § 2.2,
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
 * **Ce que le chiffrage de l'agrégat dit en plus des montants** — les remises
 * rejouées qu'une révision ferait perdre, les promotions écartées au-delà de
 * cinq. Lu par l'appelant sur LE calcul de l'agrégat : jusqu'au 2026-11-04,
 * l'appelant refaisait `priceBasket` pour les obtenir (L7).
 */
export interface OrderPricingNotes {
  readonly refusals: BasketAmounts["refusals"];
  readonly beyondCap: BasketAmounts["beyondCap"];
}

/**
 * L'entrée complète de la composition, et ce que son chiffrage dit. Le panier
 * passe par `priceBasket`, une seule fois. Depuis le 2026-11-04 (L7, 2a), il
 * n'existe plus d'entrée aux montants déjà composés : une commande dont le
 * domaine ne peut pas produire les montants n'est pas une commande.
 */
export function draftInputOf(
  input: PricedDraftInput,
  vatMethod: OrderVatMethod,
): { readonly input: DraftOrderInput; readonly notes: OrderPricingNotes } {
  const { pricing, ...identity } = input;
  const priced = priceBasket(
    pricing.context,
    { vatMethod, handoverAt: pricing.handoverAt },
    pricing.verdicts,
  );
  return {
    input: { ...identity, ...priced.terms },
    notes: { refusals: priced.refusals, beyondCap: priced.beyondCap },
  };
}
