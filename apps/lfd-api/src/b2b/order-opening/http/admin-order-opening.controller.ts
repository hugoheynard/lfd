import {
  type OrderOpeningPatch,
  orderOpeningPatchSchema,
  type OrderOpeningView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UpdateOrderOpeningCommand } from "../application/commands/update-order-opening.command.js";
import { GetOrderOpeningQuery } from "../application/queries/get-order-opening.query.js";

/**
 * Réglage **staff** de l'ouverture du e-commerce (« Réglages › Commandes ›
 * Ouverture du e-commerce »). Sous sa propre ressource, `lfc_order_opening`,
 * depuis le 2026-10-13 (Hugo, Q5 de
 * `documentation/commandes/plan-reglages-commandes.md`) : c'est
 * l'interrupteur qui ferme toute prise de commande d'une clientèle, il ne se
 * confond pas avec l'heure limite. L'action se déduit du verbe (`@AdminSurface`).
 */
@Controller("admin/order-opening")
@AdminSurface("lfc_order_opening")
export class AdminOrderOpeningController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<OrderOpeningView> {
    return this.queries.execute<GetOrderOpeningQuery, OrderOpeningView>(new GetOrderOpeningQuery());
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(orderOpeningPatchSchema)) patch: OrderOpeningPatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateOrderOpeningCommand, void>(
      new UpdateOrderOpeningCommand(patch, staffUserId),
    );
  }
}
