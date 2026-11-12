import type {
  DeliveryAudienceTerms,
  DeliveryPricingPatch,
  DeliveryPricingTerms,
} from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import { deliveryPricingTermsOf } from "./delivery-audience-terms.js";

type AudienceTermsPatch = NonNullable<DeliveryPricingPatch["b2b"]>;

/**
 * **Le réglage global de livraison, par audience**, tel qu'on l'écrit (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0a) : le
 * frais de base et le franco des pros et des particuliers, dont chaque zone
 * hérite.
 *
 * Copié sur `CustomerCancellationSettings` : un réglage sans transition, dont
 * la seule règle de refus — des valeurs qu'aucun calcul ne saurait appliquer —
 * vit dans {@link deliveryPricingTermsOf}. Ce que cette classe garantit en
 * plus est la TRACE : un réglage posé porte son instant et son auteur, et ne
 * se construit qu'à partir de l'état courant.
 */
export class DeliveryPricing {
  private constructor(
    readonly terms: DeliveryPricingTerms,
    readonly at: Date,
    readonly author: StaffTrace,
  ) {}

  /**
   * L'état courant, modifié par les seules clés présentes du patch ; `null`
   * dans le patch efface la valeur.
   *
   * @throws {InvalidDeliveryFeeError} un frais invalide.
   * @throws {InvalidFreeDeliveryThresholdError} un franco invalide.
   */
  static pose(input: {
    readonly current: DeliveryPricingTerms;
    readonly patch: DeliveryPricingPatch;
    readonly at: Date;
    readonly author: StaffTrace;
  }): DeliveryPricing {
    const { current, patch } = input;
    const terms = deliveryPricingTermsOf({
      b2b: patched(current.b2b, patch.b2b),
      b2c: patched(current.b2c, patch.b2c),
    });
    return new DeliveryPricing(terms, input.at, input.author);
  }

  /**
   * Le réglage posé diffère-t-il de `current` ? Un patch rejoué, ou qui
   * redit l'état courant, ne change rien : ni écriture, ni fait, ni purge.
   */
  changes(current: DeliveryPricingTerms): boolean {
    return (
      !sameAudienceTerms(this.terms.b2b, current.b2b) ||
      !sameAudienceTerms(this.terms.b2c, current.b2c)
    );
  }
}

function sameAudienceTerms(left: DeliveryAudienceTerms, right: DeliveryAudienceTerms): boolean {
  return (
    left.freeDeliveryThresholdCents === right.freeDeliveryThresholdCents &&
    sameFee(left.fee, right.fee)
  );
}

function sameFee(left: DeliveryAudienceTerms["fee"], right: DeliveryAudienceTerms["fee"]): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  if (left.mode === "percent") {
    return right.mode === "percent" && left.bp === right.bp;
  }
  return right.mode === "amount" && left.cents === right.cents;
}

function patched(
  current: DeliveryAudienceTerms,
  patch: AudienceTermsPatch | undefined,
): DeliveryAudienceTerms {
  return {
    fee: patch?.fee === undefined ? current.fee : patch.fee,
    freeDeliveryThresholdCents:
      patch?.freeDeliveryThresholdCents === undefined
        ? current.freeDeliveryThresholdCents
        : patch.freeDeliveryThresholdCents,
  };
}
