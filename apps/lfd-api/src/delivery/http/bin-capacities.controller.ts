import {
  type BinCapacitiesView,
  type SetBinCapacityPayload,
  setBinCapacityPayloadSchema,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SetBinCapacityCommand } from "../application/commands/set-bin-capacity.command.js";
import { GetBinCapacitiesQuery } from "../application/queries/get-bin-capacities.query.js";

/**
 * **La grille des contenances** — bacs × produits (lot 4 bis, v2-2 : Q4
 * tranchée, la contenance est une donnée de la livraison). Une case à la
 * fois : `PUT` avec `units`, ou `null` pour la vider. Il n'injecte que les bus.
 */
@Controller("admin/livraison/contenances")
@AdminSurface("delivery_settings")
export class BinCapacitiesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission("delivery_settings:read", "delivery_rounds:read")
  grid(): Promise<BinCapacitiesView> {
    return this.queries.execute<GetBinCapacitiesQuery, BinCapacitiesView>(
      new GetBinCapacitiesQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Body(new ZodBody(setBinCapacityPayloadSchema)) payload: SetBinCapacityPayload,
  ): Promise<void> {
    await this.commands.execute<SetBinCapacityCommand, void>(new SetBinCapacityCommand(payload));
  }
}
