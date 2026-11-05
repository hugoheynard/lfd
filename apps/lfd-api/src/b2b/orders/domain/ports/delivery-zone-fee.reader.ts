import type { CartAdjustment, CustomerAudience, DeliveryZoneView } from "@lfd/contracts";

/** La zone d'un code postal, et le barème que CETTE audience y paie. */
export interface PricedDeliveryZone {
  readonly zone: DeliveryZoneView;
  /** Résolu : remplacement de la zone, sinon réglage global, sinon ancien frais de la zone. */
  readonly fee: CartAdjustment;
}

/**
 * **« Quelle zone livre ce code postal, et que paie cette audience ? »** (plan
 * `plan-livraison-offerte.md`, 0b). Déclaré par les commandes, implémenté par
 * les zones de livraison : la règle de résolution vit chez elles, et le
 * chiffrage reçoit un barème déjà résolu, que `price-basket.ts` est seul à
 * appliquer.
 */
export abstract class DeliveryZoneFeeReader {
  /** `null` = aucune zone ne couvre ce code postal. */
  abstract zoneFor(
    codePostal: string,
    audience: CustomerAudience,
  ): Promise<PricedDeliveryZone | null>;
}
