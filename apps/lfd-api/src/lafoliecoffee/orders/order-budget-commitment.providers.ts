import type { Provider, Type } from "@nestjs/common";

import { CorrectOrderBudgetCommitmentHandler } from "./application/commands/correct-order-budget-commitment.handler.js";
import { GetBudgetCommitmentRequirementsHandler } from "./application/queries/get-budget-commitment-requirements.handler.js";
import { OrderBudgetCommitmentRepository } from "./domain/ports/order-budget-commitment.repository.js";
import { AdminOrderBudgetCommitmentController } from "./http/admin-order-budget-commitment.controller.js";
import { MyBudgetCommitmentRequirementsController } from "./http/my-budget-commitment-requirements.controller.js";
import { PrismaOrderBudgetCommitmentRepository } from "./infrastructure/prisma-order-budget-commitment.repository.js";

/**
 * L'engagement budgétaire d'un organisme public (plan
 * `plan-clients-publics-chorus.md`, § 6 quater) : sa correction et ce que le
 * payeur exige. À part du module, qui dépasse déjà la taille d'un fichier.
 * `PayerCommitmentRequirements` vient de `PayerCommitmentRequirementsModule`.
 */
export const ORDER_BUDGET_COMMITMENT_PROVIDERS: readonly Provider[] = [
  CorrectOrderBudgetCommitmentHandler,
  GetBudgetCommitmentRequirementsHandler,
  { provide: OrderBudgetCommitmentRepository, useClass: PrismaOrderBudgetCommitmentRepository },
];

export const ORDER_BUDGET_COMMITMENT_CONTROLLERS: readonly Type[] = [
  AdminOrderBudgetCommitmentController,
  MyBudgetCommitmentRequirementsController,
];
