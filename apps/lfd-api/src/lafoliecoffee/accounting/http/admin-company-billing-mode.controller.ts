import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  initialPayerBillingModePayloadSchema,
  type InitialPayerBillingModePayload,
  type InitialPayerBillingModeView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ChooseInitialPayerBillingModeCommand } from "../application/commands/choose-initial-payer-billing-mode.command.js";
import { GetInitialPayerBillingModeQuery } from "../application/queries/get-initial-payer-billing-mode.query.js";

/**
 * **Le premier choix du mode de facturation**, depuis la fiche d'un compte
 * client, sous le droit sociétés (décidé par Hugo le 2026-11-12). Moindre
 * privilège : seulement le premier choix — le changer ensuite reste un geste
 * comptable (`/admin/accounting/legal-entities/:id/payers/:companyId/billing-mode`).
 * Ce que l'écran du choix lit se lit ici aussi, sous le même droit : il ne
 * demande aucune lecture comptable.
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyBillingModeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Les entités en service, le mode déjà choisi chez chacune, et si ce compte
   * a un mode à choisir (faux pour un site facturé chez son principal).
   */
  @Get(":companyId/billing-mode/initial")
  async readInitial(@Param("companyId") companyId: string): Promise<InitialPayerBillingModeView> {
    return this.queries.execute<GetInitialPayerBillingModeQuery, InitialPayerBillingModeView>(
      new GetInitialPayerBillingModeQuery(companyId),
    );
  }

  /**
   * Pose le premier mode du payeur chez l'entité — 409
   * `accounting.payer_mode.already_chosen` si un autre mode y est déjà choisi.
   */
  @Put(":companyId/billing-mode/initial")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "le premier choix se pose une fois : le même mode redemandé ne réécrit rien (204), un autre est refusé (409)",
  )
  async chooseInitial(
    @StaffUserId() staffUserId: string,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(initialPayerBillingModePayloadSchema))
    payload: InitialPayerBillingModePayload,
  ): Promise<void> {
    await this.commands.execute(
      new ChooseInitialPayerBillingModeCommand(
        payload.legalEntityId,
        companyId,
        payload.mode,
        staffUserId,
      ),
    );
  }
}
