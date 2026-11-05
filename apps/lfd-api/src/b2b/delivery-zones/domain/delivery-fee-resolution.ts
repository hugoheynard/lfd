import type {
  AdminDeliveryZoneView,
  AudienceDeliveryZoneView,
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

/**
 * **Le franco d'une audience dans une zone** (plan
 * `plan-livraison-offerte.md`, sous-lot 1b) : le seuil HT, en centimes, au-delà
 * duquel la livraison est offerte — le remplacement de la zone pour cette
 * audience, sinon le réglage global de l'audience.
 *
 * `null` = pas de franco. Contrairement au frais, il n'y a pas de troisième
 * repli : l'ancien frais unique de la zone n'a jamais eu de seuil, et sans
 * réglage aucune commande ne change de prix.
 */
export function resolvedFreeDeliveryThreshold(
  audience: CustomerAudience,
  zone: Pick<AdminDeliveryZoneView, "audienceTerms">,
  global: DeliveryPricingTerms,
): number | null {
  return (
    zone.audienceTerms[audience].freeDeliveryThresholdCents ??
    global[audience].freeDeliveryThresholdCents
  );
}

/**
 * **Une zone telle qu'une clientèle la lit** (route publique, sous-lot 0c) : le
 * frais et le seuil résolus par les deux fonctions ci-dessus — les mêmes que
 * le devis facture —, sans les remplacements eux-mêmes. Une seule
 * arithmétique : la boutique annonce ce que la caisse appliquera.
 */
export function audienceDeliveryZone(
  audience: CustomerAudience,
  zone: AdminDeliveryZoneView,
  global: DeliveryPricingTerms,
): AudienceDeliveryZoneView {
  return {
    id: zone.id,
    postalPrefixes: zone.postalPrefixes,
    label: zone.label,
    audience,
    fee: resolvedDeliveryFee(audience, zone, global),
    freeDeliveryThresholdCents: resolvedFreeDeliveryThreshold(audience, zone, global),
  };
}
