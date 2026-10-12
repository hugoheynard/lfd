import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  setBillingModeDatesPayloadSchema,
  setPayerBillingModePayloadSchema,
  type PayerBillingModeView,
  type SetBillingModeDatesPayload,
  type SetPayerBillingModePayload,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelBillingModeDatesCommand } from "../application/commands/cancel-billing-mode-dates.command.js";
import { CancelPayerBillingModeCommand } from "../application/commands/cancel-payer-billing-mode.command.js";
import { ScheduleBillingModeDatesCommand } from "../application/commands/schedule-billing-mode-dates.command.js";
import { SetPayerBillingModeCommand } from "../application/commands/set-payer-billing-mode.command.js";
import { GetPayerBillingModeQuery } from "../application/queries/get-payer-billing-mode.query.js";

/**
 * **Les dates des modes de facturation, le mode des payeurs** (plan
 * `plan-rythme-de-facturation.md`, §16, lot M1).
 *
 * L'entité fixe les dates de chacun des trois modes ; chaque payeur en choisit
 * un. Un changement ne prend jamais effet à l'instant du geste mais à la
 * prochaine clôture de la suite actuelle, et un seul à la fois (409 tant
 * qu'il n'a pas pris effet) ; le programmé s'annule avant sa prise d'effet.
 * Le mode d'un `:mode` inconnu, les jours hors bornes : 400, nommés par le
 * domaine.
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminBillingModesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Programme les dates d'un mode. */
  @Put(":id/billing-modes/:mode")
  @HttpCode(HttpStatus.NO_CONTENT)
  async scheduleDates(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("mode") mode: string,
    @Body(new ZodBody(setBillingModeDatesPayloadSchema)) payload: SetBillingModeDatesPayload,
  ): Promise<void> {
    await this.commands.execute(
      new ScheduleBillingModeDatesCommand(id, mode, payload.days, staffUserId),
    );
  }

  /** Annule les dates programmées d'un mode — 409 si rien n'est programmé. */
  @Delete(":id/billing-modes/:mode/scheduled")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelDates(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("mode") mode: string,
  ): Promise<void> {
    await this.commands.execute(new CancelBillingModeDatesCommand(id, mode, staffUserId));
  }

  /** Le mode d'un payeur, ses dates programmées et ses trois prochaines clôtures. */
  @Get(":id/payers/:companyId/billing-mode")
  async payerMode(
    @Param("id") id: string,
    @Param("companyId") companyId: string,
  ): Promise<PayerBillingModeView> {
    return this.queries.execute<GetPayerBillingModeQuery, PayerBillingModeView>(
      new GetPayerBillingModeQuery(id, companyId),
    );
  }

  /** Programme le mode d'un payeur — 409 pour un site facturé chez un autre. */
  @Put(":id/payers/:companyId/billing-mode")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setPayerMode(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setPayerBillingModePayloadSchema)) payload: SetPayerBillingModePayload,
  ): Promise<void> {
    await this.commands.execute(
      new SetPayerBillingModeCommand(id, companyId, payload.mode, staffUserId),
    );
  }

  /** Annule le mode programmé d'un payeur — 409 si rien n'est programmé. */
  @Delete(":id/payers/:companyId/billing-mode/scheduled")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPayerMode(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("companyId") companyId: string,
  ): Promise<void> {
    await this.commands.execute(new CancelPayerBillingModeCommand(id, companyId, staffUserId));
  }
}
