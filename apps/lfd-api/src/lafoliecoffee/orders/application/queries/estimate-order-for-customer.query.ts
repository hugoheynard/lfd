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
    /**
     * Le droit `lfc_product_limit_override:write` de celui qui saisit, lu en
     * base par la porte staff : l'estimation compose et annonce comme la
     * passation le ferait pour lui.
     */
    readonly exceedItemLimits: boolean,
    /**
     * Le droit `b2b_counter_accounts:write` de celui qui saisit, lu en base
     * par la porte staff : au comptoir, il règle au compte d'un compte ouvert
     * au comptoir (`plan-comptes-du-comptoir.md`, § 3.2). Sans lui, refusé.
     */
    readonly chargesCounterAccounts: boolean = false,
  ) {}
}
