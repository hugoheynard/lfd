import { type DeparturePayload, departurePayloadSchema, type DepartureView } from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { ChooseDepartureCommand } from "../application/commands/choose-departure.command.js";
import { GetDepartureQuery } from "../application/queries/get-departure.query.js";

/**
 * **D'où partent les tournées** — un point de retrait, référencé
 * (`plan-preparation-de-tournee.md`, Q9). Sous `delivery_settings`, comme la
 * flotte. Il n'injecte que les bus.
 */
@Controller("admin/livraison/depart")
@AdminSurface("delivery_settings")
export class DepartureController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DepartureView> {
    return this.queries.execute<GetDepartureQuery, DepartureView>(new GetDepartureQuery());
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async choose(
    @Body(new ZodBody(departurePayloadSchema)) payload: DeparturePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ChooseDepartureCommand, void>(
      new ChooseDepartureCommand(payload.pickupAddressId, staffUserId),
    );
  }
}
