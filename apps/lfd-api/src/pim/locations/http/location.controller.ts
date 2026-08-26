import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  createLocationPayloadSchema,
  updateLocationPayloadSchema,
  type CreateLocationPayload,
  type LocationView,
  type UpdateLocationPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateLocationCommand } from "../application/create-location.js";
import { RemoveLocationCommand } from "../application/remove-location.js";
import { GenerateTableQrCommand } from "../application/generate-table-qr.js";
import { ListLocationsQuery } from "../application/list-locations.js";
import { RemoveTableQrCommand } from "../application/remove-table-qr.js";
import { UpdateLocationCommand } from "../application/update-location.js";

/**
 * **Emplacements** — points de vente : leurs modes, leur grille de tables et
 * les QR de commande à table. Le contrôleur ne fait que dispatcher sur les bus
 * CQRS : commandes qui mutent, requête qui lit.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 */
@AdminSurface("catalog")
@Controller("locations")
export class LocationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listLocations(): Promise<LocationView[]> {
    return this.queries.execute<ListLocationsQuery, LocationView[]>(new ListLocationsQuery());
  }

  @Post()
  async createLocation(
    @Body(new ZodBody(createLocationPayloadSchema))
    body: CreateLocationPayload,
  ) {
    const id = await this.commands.execute<CreateLocationCommand, string>(
      new CreateLocationCommand(body),
    );
    return { id };
  }

  @Put(":id")
  async updateLocation(
    @Param("id") id: string,
    @Body(new ZodBody(updateLocationPayloadSchema))
    body: UpdateLocationPayload,
  ) {
    await this.commands.execute<UpdateLocationCommand, void>(new UpdateLocationCommand(id, body));
    return { id };
  }

  @Delete(":id")
  async removeLocation(@Param("id") id: string) {
    await this.commands.execute<RemoveLocationCommand, void>(new RemoveLocationCommand(id));
    return { id };
  }

  @Post(":id/tables/:number/qr")
  async generateTableQr(
    @Param("id") id: string,
    @Param("number", ParseIntPipe) tableNumber: number,
  ) {
    const token = await this.commands.execute<GenerateTableQrCommand, string>(
      new GenerateTableQrCommand(id, tableNumber),
    );
    return { token };
  }

  @Delete(":id/tables/:number/qr")
  async removeTableQr(@Param("id") id: string, @Param("number", ParseIntPipe) tableNumber: number) {
    await this.commands.execute<RemoveTableQrCommand, void>(
      new RemoveTableQrCommand(id, tableNumber),
    );
    return { id, tableNumber };
  }
}
