import {
  correctBudgetCommitmentPayloadSchema,
  type BudgetCommitmentRequirementsView,
  type CorrectBudgetCommitmentPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CorrectOrderBudgetCommitmentCommand } from "../application/commands/correct-order-budget-commitment.command.js";
import { GetBudgetCommitmentRequirementsQuery } from "../application/queries/get-budget-commitment-requirements.query.js";

/**
 * **L'engagement budgétaire d'un organisme public, vu de l'équipe** (plan
 * `plan-clients-publics-chorus.md`, § 6 quater) : ce que le payeur exige, pour
 * la saisie, et la correction d'une commande pas encore facturée.
 */
@Controller("admin")
@AdminSurface("b2b_orders")
export class AdminOrderBudgetCommitmentController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Ce que le payeur de cette société exige (le principal d'un site qui en
   * suit la facturation). `404` : société inconnue.
   */
  @Get("companies/:companyId/budget-commitment-requirements")
  @RequirePermission("b2b_place_order:write")
  requirements(@Param("companyId") companyId: string): Promise<BudgetCommitmentRequirementsView> {
    return this.queries.execute<
      GetBudgetCommitmentRequirementsQuery,
      BudgetCommitmentRequirementsView
    >(new GetBudgetCommitmentRequirementsQuery(companyId));
  }

  /**
   * **Corriger l'engagement** (E3′). Corps `{ budgetCommitment: { number,
   * serviceCode } | null }`. `204` : la commande se relit (`GET
   * admin/orders/:id`). Refus : forme (`400`
   * `budget_commitment.invalid`), commande inconnue (`404`), facturée ou
   * engagée (`409` `budget_commitment.already_invoiced`), numéro ou code
   * exigé absent, payeur privé (`409`).
   */
  @Put("orders/:orderId/budget-commitment")
  @RequirePermission("b2b_place_order:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "état posé : rejouée, la même valeur relue sous verrou est déjà celle de la commande, l'agrégat ne change rien et rien n'est journalisé",
  )
  async correct(
    @Param("orderId") orderId: string,
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(correctBudgetCommitmentPayloadSchema))
    payload: CorrectBudgetCommitmentPayload,
  ): Promise<void> {
    await this.commands.execute<CorrectOrderBudgetCommitmentCommand, void>(
      new CorrectOrderBudgetCommitmentCommand(orderId, staffUserId, payload.budgetCommitment),
    );
  }
}
