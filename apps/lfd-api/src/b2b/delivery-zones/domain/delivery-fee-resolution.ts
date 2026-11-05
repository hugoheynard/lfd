import type {
  AdminDeliveryZoneView,
  CartAdjustment,
  CustomerAudience,
  DeliveryPricingTerms,
} from "@lfd/contracts";

/**
 * **Le frais de livraison d'une audience dans une zone** (plan
 * `documentation/promotions/plan-livraison-offerte.md`, sous-lot 0b) : le
 * remplacement de la zone pour cette audience, sinon le réglage global de
 * l'audience, sinon l'ancien frais unique de la zone (`fee_mode`/`fee_value`).
 *
 * Le dernier repli rend le 0b sans effet tant que personne n'a rien saisi :
 * sans réglage global ni remplacement, chaque audience paie exactement ce
 * qu'elle payait. Il rend aussi INEXPRIMABLE le cas « aucun frais résolu pour
 * une audience ouverte », que le plan voulait refuser par une erreur nommée :
 * l'ancien frais est NOT NULL en base, la résolution rend toujours un barème,
 * jamais un frais gratuit par accident.
 */
export function resolvedDeliveryFee(
  audience: CustomerAudience,
  zone: Pick<AdminDeliveryZoneView, "fee" | "audienceTerms">,
  global: DeliveryPricingTerms,
): CartAdjustment {
  return zone.audienceTerms[audience].fee ?? global[audience].fee ?? zone.fee;
}
