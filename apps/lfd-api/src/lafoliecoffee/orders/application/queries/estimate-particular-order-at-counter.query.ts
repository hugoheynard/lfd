import type { CounterParticularOrderEstimatePayload } from "@lfd/contracts";

/**
 * **Ce que la commande d'un particulier notée au comptoir coûterait**, si on
 * la passait maintenant — composée par la même préparation que la passation
 * (`commande-particulier-reglee-en-boutique.md`, § 5). `staffUserId`
 * vient de la porte, comme pour la passation.
 */
export class EstimateParticularOrderAtCounterQuery {
  constructor(
    readonly staffUserId: string,
    readonly payload: CounterParticularOrderEstimatePayload,
  ) {}
}
