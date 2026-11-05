import type { CustomerAudience, DeliveryAudienceTerms, DeliveryPricingTerms } from "@lfd/contracts";

import { DomainError } from "../../../platform/shared/errors/app-error.js";

/** Un taux s'écrit en points de base : 10 000 = 100 %. */
const MAX_PERCENT_BP = 10_000;

const AUDIENCE_LABELS: Readonly<Record<CustomerAudience, string>> = {
  b2b: "des pros",
  b2c: "des particuliers",
};

/**
 * **Ce qu'une audience paie pour être livrée**, à un niveau (le réglage global
 * ou le remplacement d'une zone), refusé s'il est invalide (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0a).
 *
 * `null` est permis partout : rien de réglé à ce niveau. Ce qui est refusé, ce
 * sont les valeurs qu'aucun calcul ne saurait appliquer — un frais négatif, un
 * taux au-delà de 100 %, un franco négatif, une fraction de centime. Les
 * mêmes bornes sont tenues en base par des CHECK.
 *
 * @throws {InvalidDeliveryFeeError} frais négatif, fractionnaire ou taux > 100 %.
 * @throws {InvalidFreeDeliveryThresholdError} franco négatif ou fractionnaire.
 */
export function deliveryAudienceTermsOf(
  audience: CustomerAudience,
  terms: DeliveryAudienceTerms,
): DeliveryAudienceTerms {
  const { fee, freeDeliveryThresholdCents } = terms;
  if (fee !== null) {
    const value = fee.mode === "percent" ? fee.bp : fee.cents;
    const tooHigh = fee.mode === "percent" && value > MAX_PERCENT_BP;
    if (!Number.isInteger(value) || value < 0 || tooHigh) {
      throw new InvalidDeliveryFeeError(audience);
    }
  }
  if (
    freeDeliveryThresholdCents !== null &&
    (!Number.isInteger(freeDeliveryThresholdCents) || freeDeliveryThresholdCents < 0)
  ) {
    throw new InvalidFreeDeliveryThresholdError(audience);
  }
  return { fee, freeDeliveryThresholdCents };
}

/** Les deux audiences d'un niveau, chacune validée. */
export function deliveryPricingTermsOf(terms: DeliveryPricingTerms): DeliveryPricingTerms {
  return {
    b2b: deliveryAudienceTermsOf("b2b", terms.b2b),
    b2c: deliveryAudienceTermsOf("b2c", terms.b2c),
  };
}

/** Un frais de livraison qu'aucun calcul ne saurait appliquer (**400**). */
export class InvalidDeliveryFeeError extends DomainError {
  constructor(readonly audience: CustomerAudience) {
    super(
      "delivery_pricing.invalid_fee",
      `Le frais de livraison ${AUDIENCE_LABELS[audience]} doit être un montant positif ou nul, ou un pourcentage entre 0 et 100 % : corrigez la valeur, ou videz-la pour ne rien régler.`,
    );
  }
}

/** Un franco négatif ou fractionnaire (**400**). */
export class InvalidFreeDeliveryThresholdError extends DomainError {
  constructor(readonly audience: CustomerAudience) {
    super(
      "delivery_pricing.invalid_free_delivery_threshold",
      `Le seuil de livraison offerte ${AUDIENCE_LABELS[audience]} doit être un montant HT positif ou nul, au centime : corrigez-le, ou videz-le pour ne pas offrir la livraison.`,
    );
  }
}
