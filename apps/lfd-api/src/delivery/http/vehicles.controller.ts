import {
  type CreatedIdResponse,
  type VehiclePayload,
  vehiclePayloadSchema,
  type VehiclesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { AddVehicleCommand } from "../application/commands/add-vehicle.command.js";
import { CorrectVehicleCommand } from "../application/commands/correct-vehicle.command.js";
import { ReactivateVehicleCommand } from "../application/commands/reactivate-vehicle.command.js";
import { RetireVehicleCommand } from "../application/commands/retire-vehicle.command.js";
import { ListVehiclesQuery } from "../application/queries/list-vehicles.query.js";

/**
 * **La flotte** — Livraison → Véhicules
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 2a).
 *
 * Sous `delivery_settings` : la lecture (`GET`) pour qui prépare les départs,
 * l'écriture pour qui règle la flotte. Retirer et réactiver sont des `POST`
 * nommés — des gestes, pas une colonne qu'on écrit. Il n'injecte que les bus.
 */
@Controller("admin/livraison/vehicules")
@AdminSurface("delivery_settings")
export class VehiclesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * La lecture s'ouvre aussi à qui lit les tournées (Q10 « A ») : préparer un
   * départ demande de voir ce réglage, jamais de le modifier.
   */
  @Get()
  @RequireAnyPermission("delivery_settings:read", "delivery_rounds:read")
  list(): Promise<VehiclesView> {
    return this.queries.execute<ListVehiclesQuery, VehiclesView>(new ListVehiclesQuery());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async add(
    @Body(new ZodBody(vehiclePayloadSchema)) payload: VehiclePayload,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<AddVehicleCommand, string>(
      new AddVehicleCommand(payload),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async correct(
    @Param("id") id: string,
    @Body(new ZodBody(vehiclePayloadSchema)) payload: VehiclePayload,
  ): Promise<void> {
    await this.commands.execute<CorrectVehicleCommand, void>(
      new CorrectVehicleCommand(id, payload),
    );
  }

  @Post(":id/retrait")
  @HttpCode(HttpStatus.NO_CONTENT)
  async retire(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RetireVehicleCommand, void>(new RetireVehicleCommand(id));
  }

  @Post(":id/reactivation")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reactivate(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ReactivateVehicleCommand, void>(new ReactivateVehicleCommand(id));
  }
}
