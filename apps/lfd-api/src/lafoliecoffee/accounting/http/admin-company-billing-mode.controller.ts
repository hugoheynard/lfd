import { Body, Controller, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  initialPayerBillingModePayloadSchema,
  type InitialPayerBillingModePayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ChooseInitialPayerBillingModeCommand } from "../application/commands/choose-initial-payer-billing-mode.command.js";

/**
 * **Le premier choix du mode de facturation**, depuis la fiche d'un compte
 * client, sous le droit sociétés (décidé par Hugo le 2026-11-12). Moindre
 * privilège : seulement le premier choix — le changer ensuite reste un geste
 * comptable (`/admin/accounting/legal-entities/:id/payers/:companyId/billing-mode`).
 */
@Controller("admin/companies")
@AdminSurface("b2b_companies")
export class AdminCompanyBillingModeController {
  constructor(private readonly commands: CommandBus) {}

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
