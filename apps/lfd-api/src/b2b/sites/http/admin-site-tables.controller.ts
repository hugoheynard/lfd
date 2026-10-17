import {
  type SiteTableCountPayload,
  siteTableCountPayloadSchema,
  type SiteTablesView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GenerateSiteTableQrCommand } from "../application/generate-site-table-qr.command.js";
import { GetSiteTablesQuery } from "../application/get-site-tables.query.js";
import { RemoveSiteTableQrCommand } from "../application/remove-site-table-qr.command.js";
import { SetSiteTableCountCommand } from "../application/set-site-table-count.command.js";

/**
 * **Réglages › Sites › Tables** — la grille de la salle d'un site, sous
 * `lfc_site_settings` comme le reste de la page (plan
 * `documentation/sites/plan-sur-place-capacite-de-site.md`, L2).
 *
 * Les écritures ne rendent rien : l'écran relit la grille, qui porte
 * l'adresse de chaque QR.
 */
@Controller("admin/sites/:id/tables")
@AdminSurface("lfc_site_settings")
export class AdminSiteTablesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(@Param("id") id: string): Promise<SiteTablesView> {
    return this.queries.execute<GetSiteTablesQuery, SiteTablesView>(new GetSiteTablesQuery(id));
  }

  /** Le nombre de tables : on en ajoute ou on en retire en fin de grille. */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async setCount(
    @Param("id") id: string,
    @Body(new ZodBody(siteTableCountPayloadSchema)) payload: SiteTableCountPayload,
  ): Promise<void> {
    await this.commands.execute<SetSiteTableCountCommand, void>(
      new SetSiteTableCountCommand(id, payload.count),
    );
  }

  /** (Re)génère le QR : l'ancien code imprimé de cette table ne vaut plus. */
  @Post(":number/qr")
  @HttpCode(HttpStatus.NO_CONTENT)
  async generateQr(
    @Param("id") id: string,
    @Param("number", ParseIntPipe) tableNumber: number,
  ): Promise<void> {
    await this.commands.execute<GenerateSiteTableQrCommand, void>(
      new GenerateSiteTableQrCommand(id, tableNumber),
    );
  }

  @Delete(":number/qr")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeQr(
    @Param("id") id: string,
    @Param("number", ParseIntPipe) tableNumber: number,
  ): Promise<void> {
    await this.commands.execute<RemoveSiteTableQrCommand, void>(
      new RemoveSiteTableQrCommand(id, tableNumber),
    );
  }
}
