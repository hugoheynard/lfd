import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { tvaRatePayloadSchema, type TvaRatePayload, type TvaRateView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateTvaRateCommand } from "../application/create-tva-rate.js";
import { ListTvaRatesQuery } from "../application/list-tva-rates.js";
import { RemoveTvaRateCommand } from "../application/remove-tva-rate.js";
import { UpdateTvaRateCommand } from "../application/update-tva-rate.js";

/**
 * Taux de **TVA** — référence commerciale partagée (catégories + Shopify). Le
 * contrôleur ne fait que **dispatcher** sur les bus CQRS : commandes qui mutent,
 * requête qui lit.
 *
 * Surface staff murée par `@AdminSurface("tax")` : identité vérifiée contre
 * l'annuaire, puis périmètre. Elle a été **ouverte** tant que le référentiel
 * vivait dans son propre processus — un jeton Auth0 valide suffisait, et un
 * révoqué gardait la main sur le catalogue.
 *
 * `tax` et non `catalog` : poser un taux de TVA est une décision comptable, et
 * `catalog:write` est réservé à l'admin. La comptabilité voyait les taux
 * sans pouvoir les toucher. La frontière s'arrête ici — POUSSER les collections
 * de taxe vers un canal reste `catalog:write`.
 */
@AdminSurface("tax")
@Controller("commerce/tva-rates")
export class TvaRateController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<TvaRateView[]> {
    return this.queries.execute<ListTvaRatesQuery, TvaRateView[]>(new ListTvaRatesQuery());
  }

  @Post()
  async create(@Body(new ZodBody(tvaRatePayloadSchema)) body: TvaRatePayload) {
    const id = await this.commands.execute<CreateTvaRateCommand, string>(
      new CreateTvaRateCommand(body),
    );
    return { id };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(tvaRatePayloadSchema)) body: TvaRatePayload,
  ) {
    await this.commands.execute<UpdateTvaRateCommand, void>(new UpdateTvaRateCommand(id, body));
    return { id };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.commands.execute<RemoveTvaRateCommand, void>(new RemoveTvaRateCommand(id));
    return { id };
  }
}
