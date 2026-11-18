import type { BudgetCommitmentPayload } from "@lfd/contracts";

/**
 * **L'équipe corrige l'engagement budgétaire d'une commande** (plan
 * `plan-clients-publics-chorus.md`, § 6 quater, E3′), tant qu'elle n'est pas
 * facturée. `null` retire l'engagement — refusé si le payeur l'exige.
 * `staffUserId` est l'id de la FICHE, reçu de la porte.
 */
export class CorrectOrderBudgetCommitmentCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly budgetCommitment: BudgetCommitmentPayload | null,
  ) {}
}
