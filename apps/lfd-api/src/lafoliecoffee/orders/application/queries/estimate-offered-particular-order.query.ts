import type { OfferedParticularOrderEstimatePayload } from "@lfd/contracts";

/**
 * **Ce que la commande offerte à un particulier vaudrait**, si on l'offrait
 * maintenant — composée par la même préparation que la passation
 * (`la-commande-offerte.md`, § 2.10). `staffUserId` vient de la porte,
 * comme pour la passation.
 */
export class EstimateOfferedParticularOrderQuery {
  constructor(
    readonly staffUserId: string,
    readonly payload: OfferedParticularOrderEstimatePayload,
  ) {}
}
