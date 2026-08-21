import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  tvaRegimePayloadSchema,
  type TvaRegimePayload,
  type TvaRegimeView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateTvaRegimeCommand } from "../application/create-tva-regime.js";
import { ListTvaRegimesQuery } from "../application/list-tva-regimes.js";
import { RemoveTvaRegimeCommand } from "../application/remove-tva-regime.js";
import { UpdateTvaRegimeCommand } from "../application/update-tva-regime.js";

/**
 * Régimes de **TVA** — référence commerciale partagée (catégories + Shopify). Le
 * contrôleur ne fait que **dispatcher** sur les bus CQRS : commandes qui mutent,
 * requête qui lit.
 *
 * Surface staff murée par `@AdminSurface("tax")` : identité vérifiée contre
 * l'annuaire, puis périmètre. Elle a été **ouverte** tant que le référentiel
 * vivait dans son propre processus — un jeton Auth0 valide suffisait, et un
 * révoqué gardait la main sur le catalogue.
 *
 * `tax` et non `catalog` : poser un taux de TVA est une décision comptable, et
 * `catalog:write` est réservé à l'admin. La comptabilité voyait les régimes
 * sans pouvoir les toucher. La frontière s'arrête ici — POUSSER les collections
 * de taxe vers un canal reste `catalog:write`.
 */
@AdminSurface("tax")
@Controller("commerce/tva-regimes")
export class TvaRegimeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<TvaRegimeView[]> {
    return this.queries.execute<ListTvaRegimesQuery, TvaRegimeView[]>(new ListTvaRegimesQuery());
  }

  @Post()
  async create(@Body(new ZodBody(tvaRegimePayloadSchema)) body: TvaRegimePayload) {
    const id = await this.commands.execute<CreateTvaRegimeCommand, string>(
      new CreateTvaRegimeCommand(body),
    );
    return { id };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(tvaRegimePayloadSchema)) body: TvaRegimePayload,
  ) {
    await this.commands.execute<UpdateTvaRegimeCommand, void>(new UpdateTvaRegimeCommand(id, body));
    return { id };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.commands.execute<RemoveTvaRegimeCommand, void>(new RemoveTvaRegimeCommand(id));
    return { id };
  }
}
