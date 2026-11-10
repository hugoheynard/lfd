import {
  type CreatedIdResponse,
  type OrderOpeningExemptionPayload,
  orderOpeningExemptionPayloadSchema,
  type OrderOpeningExemptionView,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GrantOrderOpeningExemptionCommand } from "../application/commands/grant-order-opening-exemption.command.js";
import { WithdrawOrderOpeningExemptionCommand } from "../application/commands/withdraw-order-opening-exemption.command.js";
import { ListOrderOpeningExemptionsQuery } from "../application/queries/list-order-opening-exemptions.query.js";

/**
 * **Les exemptions à la fermeture** (décision de Hugo du 2026-10-26) — sous
 * la ressource du réglage, `lfc_order_opening` : qui peut fermer la boutique
 * peut aussi y laisser entrer un client. `DELETE` retire de la liste ; la
 * ligne est archivée, pas effacée.
 */
@Controller("admin/order-opening/exemptions")
@AdminSurface("lfc_order_opening")
export class AdminOrderOpeningExemptionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly OrderOpeningExemptionView[]> {
    return this.queries.execute<
      ListOrderOpeningExemptionsQuery,
      readonly OrderOpeningExemptionView[]
    >(new ListOrderOpeningExemptionsQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async grant(
    @Body(new ZodBody(orderOpeningExemptionPayloadSchema)) payload: OrderOpeningExemptionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<GrantOrderOpeningExemptionCommand, string>(
      new GrantOrderOpeningExemptionCommand(payload, staffUserId),
    );
    return { id };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(@Param("id") id: string, @StaffUserId() staffUserId: string): Promise<void> {
    await this.commands.execute<WithdrawOrderOpeningExemptionCommand, void>(
      new WithdrawOrderOpeningExemptionCommand(id, staffUserId),
    );
  }
}
