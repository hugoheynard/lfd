import type { BudgetCommitmentPayload } from "@lfd/contracts";

import type { Order } from "../../domain/entities/order.js";
import type { PayerCommitmentRequirements } from "../../domain/ports/payer-commitment-requirements.js";
import { PRIVATE_PAYER } from "../../domain/services/budget-commitment-rule.js";

/**
 * **L'engagement budgétaire, jugé à la passation** (E2′) — partagé par la
 * passation du client et la saisie de l'équipe ; l'estimation ne l'appelle
 * pas (un devis sans numéro garde ses totaux). L'exigence se lit chez le
 * payeur copié sur la commande (`billedCompanyId`, le principal d'un site
 * qui en suit la facturation) ; sans société, il n'y a pas de payeur public.
 * La commande invitée de la boutique n'a ni société ni ce champ.
 */
export async function commitOrderBudget(
  order: Order,
  entered: BudgetCommitmentPayload | undefined,
  requirements: PayerCommitmentRequirements,
): Promise<void> {
  const payerId = order.billedCompanyId;
  const terms = payerId === null ? PRIVATE_PAYER : await requirements.of(payerId);
  order.commitBudget(entered ?? null, terms);
}
