import {
  adjustLoyaltyPointsPayloadSchema,
  cancelLoyaltyVoucherPayloadSchema,
  setLoyaltySettingsPayloadSchema,
  type AdjustLoyaltyPointsPayload,
  type CancelLoyaltyVoucherPayload,
  type LoyaltyBalanceView,
  type LoyaltySettingsView,
  type LoyaltyVoucherView,
  type SetLoyaltySettingsPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AdjustLoyaltyPointsCommand } from "../application/commands/adjust-loyalty-points.command.js";
import { CancelLoyaltyVoucherCommand } from "../application/commands/cancel-loyalty-voucher.command.js";
import { SetLoyaltySettingsCommand } from "../application/commands/set-loyalty-settings.command.js";
import { GetLoyaltySettingsQuery } from "../application/queries/get-loyalty-settings.query.js";
import { ListLoyaltyBalancesQuery } from "../application/queries/list-loyalty-balances.query.js";
import { ListLoyaltyVouchersQuery } from "../application/queries/list-loyalty-vouchers.query.js";

/**
 * **Comptabilité › Fidélité** (plan `plan-points-de-fidelite.md`, lot B) : le
 * réglage du programme, les soldes, les bons, l'ajustement motivé et
 * l'annulation d'un bon. Droit `b2b_accounting` ; l'action se déduit du verbe
 * (`GET` → lecture, le reste → écriture).
 */
@Controller("admin/accounting/loyalty")
@AdminSurface("b2b_accounting")
export class AdminLoyaltyController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("settings")
  readSettings(): Promise<LoyaltySettingsView> {
    return this.queries.execute<GetLoyaltySettingsQuery, LoyaltySettingsView>(
      new GetLoyaltySettingsQuery(),
    );
  }

  /** Le réglage entier : aucune valeur n'a de défaut. N'altère aucun bon émis. */
  @Put("settings")
  @HttpCode(HttpStatus.NO_CONTENT)
  async writeSettings(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(setLoyaltySettingsPayloadSchema)) payload: SetLoyaltySettingsPayload,
  ): Promise<void> {
    await this.commands.execute<SetLoyaltySettingsCommand, void>(
      new SetLoyaltySettingsCommand(payload, staffUserId),
    );
  }

  @Get("balances")
  balances(): Promise<readonly LoyaltyBalanceView[]> {
    return this.queries.execute<ListLoyaltyBalancesQuery, readonly LoyaltyBalanceView[]>(
      new ListLoyaltyBalancesQuery(),
    );
  }

  @Get("vouchers")
  vouchers(): Promise<readonly LoyaltyVoucherView[]> {
    return this.queries.execute<ListLoyaltyVouchersQuery, readonly LoyaltyVoucherView[]>(
      new ListLoyaltyVouchersQuery(),
    );
  }

  @Post("adjustments")
  @HttpCode(HttpStatus.NO_CONTENT)
  async adjust(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(adjustLoyaltyPointsPayloadSchema)) payload: AdjustLoyaltyPointsPayload,
  ): Promise<void> {
    await this.commands.execute<AdjustLoyaltyPointsCommand, void>(
      new AdjustLoyaltyPointsCommand(
        payload.holderKind,
        payload.holderId,
        payload.points,
        payload.reason,
        staffUserId,
      ),
    );
  }

  /** Annule un bon disponible ; ses points reviennent au titulaire. */
  @Post("vouchers/:id/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Body(new ZodBody(cancelLoyaltyVoucherPayloadSchema)) payload: CancelLoyaltyVoucherPayload,
  ): Promise<void> {
    await this.commands.execute<CancelLoyaltyVoucherCommand, void>(
      new CancelLoyaltyVoucherCommand(id, payload.reason, staffUserId),
    );
  }
}
