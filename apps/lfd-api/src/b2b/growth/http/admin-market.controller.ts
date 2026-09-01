import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type AddMarketNafPayload,
  addMarketNafPayloadSchema,
  type AddMarketZonePayload,
  addMarketZonePayloadSchema,
  type MarketConfigView,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddMarketNafCommand } from "../application/commands/add-market-naf.command.js";
import { AddMarketZoneCommand } from "../application/commands/add-market-zone.command.js";
import { RefreshMarketCommand } from "../application/commands/refresh-market.command.js";
import { RemoveMarketNafCommand } from "../application/commands/remove-market-naf.command.js";
import { RemoveMarketZoneCommand } from "../application/commands/remove-market-zone.command.js";
import { GetMarketConfigQuery } from "../application/queries/get-market-config.query.js";

/**
 * Surface **staff** de la config marché (Réglages ▸ Commercial). Gérer les zones
 * (codes postaux) et les NAF ciblés, et **redemander** les comptages à l'annuaire
 * externe. Le refresh renvoie la config à jour (comptages figés) en une réponse.
 */
@Controller("admin/commercial/market")
@AdminSurface("b2b_growth")
export class AdminMarketController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  config(): Promise<MarketConfigView> {
    return this.queries.execute<GetMarketConfigQuery, MarketConfigView>(new GetMarketConfigQuery());
  }

  @Post("zones")
  @HttpCode(HttpStatus.CREATED)
  async addZone(
    @Body(new ZodBody(addMarketZonePayloadSchema)) payload: AddMarketZonePayload,
  ): Promise<MarketConfigView> {
    await this.commands.execute<AddMarketZoneCommand, void>(
      new AddMarketZoneCommand(payload.codePostal),
    );
    return this.config();
  }

  @Delete("zones/:codePostal")
  @HttpCode(HttpStatus.OK)
  async removeZone(@Param("codePostal") codePostal: string): Promise<MarketConfigView> {
    await this.commands.execute<RemoveMarketZoneCommand, void>(
      new RemoveMarketZoneCommand(codePostal),
    );
    return this.config();
  }

  @Post("naf")
  @HttpCode(HttpStatus.CREATED)
  async addNaf(
    @Body(new ZodBody(addMarketNafPayloadSchema)) payload: AddMarketNafPayload,
  ): Promise<MarketConfigView> {
    await this.commands.execute<AddMarketNafCommand, void>(
      new AddMarketNafCommand(payload.code, payload.label),
    );
    return this.config();
  }

  @Delete("naf/:code")
  @HttpCode(HttpStatus.OK)
  async removeNaf(@Param("code") code: string): Promise<MarketConfigView> {
    await this.commands.execute<RemoveMarketNafCommand, void>(new RemoveMarketNafCommand(code));
    return this.config();
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(): Promise<MarketConfigView> {
    await this.commands.execute<RefreshMarketCommand, void>(new RefreshMarketCommand());
    return this.config();
  }
}
