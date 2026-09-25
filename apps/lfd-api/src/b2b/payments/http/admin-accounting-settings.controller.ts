import {
  setAccountingSettingsPayloadSchema,
  type AccountingSettingsView,
  type SetAccountingSettingsPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetAccountingSettingsCommand } from "../application/commands/set-accounting-settings.command.js";
import { GetAccountingSettingsQuery } from "../application/queries/get-accounting-settings.query.js";

/**
 * Les **réglages de la comptabilité** — aujourd'hui le seul plafond d'un lien
 * libre (Hugo, 2026-09-25 : « `null` si pas de plafond »). Droit
 * `b2b_accounting`, comme les liens qu'il borne.
 */
@Controller("admin/accounting/settings")
@AdminSurface("b2b_accounting")
export class AdminAccountingSettingsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  read(): Promise<AccountingSettingsView> {
    return this.queries.execute<GetAccountingSettingsQuery, AccountingSettingsView>(
      new GetAccountingSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async write(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(setAccountingSettingsPayloadSchema)) payload: SetAccountingSettingsPayload,
  ): Promise<void> {
    await this.commands.execute<SetAccountingSettingsCommand, void>(
      new SetAccountingSettingsCommand(payload.paymentLinkMaxCents, staffUserId),
    );
  }
}
