import type { OfferedParticularOrderEstimatePayload } from "@lfd/contracts";

/**
 * **Ce que la commande offerte à un particulier vaudrait**, si on l'offrait
 * maintenant — composée par la même préparation que la passation
 * (`plan-commande-offerte.md`, § 2.4, O7c). `staffUserId` vient de la porte,
 * comme pour la passation.
 */
export class EstimateOfferedParticularOrderQuery {
  constructor(
    readonly staffUserId: string,
    readonly payload: OfferedParticularOrderEstimatePayload,
  ) {}
}
