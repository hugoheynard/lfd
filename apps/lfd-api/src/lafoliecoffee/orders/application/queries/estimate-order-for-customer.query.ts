import type { AdminOrderEstimatePayload } from "@lfd/contracts";

/**
 * **Ce que la saisie de l'équipe coûterait, si on la passait maintenant** (plan
 * `documentation/commandes/passation/commande-passee-par-l-equipe.md`, § 8).
 *
 * Le corps est celui de la passation, règlement compris : c'est lui qui
 * décide des refus de crédit. `staffUserId` vient de la porte, comme pour la
 * passation — l'estimation compose la commande au nom du même saisisseur.
 */
export class EstimateOrderForCustomerQuery {
  constructor(
    readonly staffUserId: string,
    readonly payload: AdminOrderEstimatePayload,
  ) {}
}
