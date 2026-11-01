/**
 * **Les articles dont le prix net aura plus de deux décimales** sous cette
 * promotion (`documentation/promotions/plan-remise-par-ligne.md`, § 18.7).
 */
export class GetPromotionDecimalsQuery {
  constructor(readonly id: string) {}
}
