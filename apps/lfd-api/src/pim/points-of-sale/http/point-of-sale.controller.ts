import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  openPointOfSalePayloadSchema,
  updatePointOfSalePayloadSchema,
  type OpenPointOfSalePayload,
  type PointOfSaleView,
  type UpdatePointOfSalePayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CloseShopCommand } from "../application/close-shop.js";
import { GenerateTableQrCommand } from "../application/generate-table-qr.js";
import { ListPointsOfSaleQuery } from "../application/list-points-of-sale.js";
import { OpenPointOfSaleCommand } from "../application/open-point-of-sale.js";
import { RemoveTableQrCommand } from "../application/remove-table-qr.js";
import { UpdatePointOfSaleCommand } from "../application/update-point-of-sale.js";

/**
 * **Points de vente** — d'où l'on vend : les boutiques, leur offre de contextes
 * et leur grille de QR de table, plus la plateforme professionnelle.
 *
 * Le contrôleur ne fait que dispatcher sur les bus CQRS : commandes qui mutent,
 * requête qui lit.
 *
 * Surface staff murée par `@AdminSurface("pim_settings")` : un `GET` demande
 * `catalog:read`, tout le reste `catalog:write`.
 */
@AdminSurface("pim_settings")
@Controller("points-of-sale")
export class PointOfSaleController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  listPointsOfSale(): Promise<PointOfSaleView[]> {
    return this.queries.execute<ListPointsOfSaleQuery, PointOfSaleView[]>(
      new ListPointsOfSaleQuery(),
    );
  }

  /** Ouvre un point de vente — le **genre** est dans la charge, pas dans la route. */
  @Post()
  async openPointOfSale(
    @Body(new ZodBody(openPointOfSalePayloadSchema))
    body: OpenPointOfSalePayload,
  ) {
    const id = await this.commands.execute<OpenPointOfSaleCommand, string>(
      new OpenPointOfSaleCommand(body),
    );
    return { id };
  }

  @Put(":id")
  async updatePointOfSale(
    @Param("id") id: string,
    @Body(new ZodBody(updatePointOfSalePayloadSchema))
    body: UpdatePointOfSalePayload,
  ) {
    await this.commands.execute<UpdatePointOfSaleCommand, void>(
      new UpdatePointOfSaleCommand(id, body),
    );
    return { id };
  }

  @Delete(":id")
  async closeShop(@Param("id") id: string) {
    await this.commands.execute<CloseShopCommand, void>(new CloseShopCommand(id));
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
