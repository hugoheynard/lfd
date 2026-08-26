import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { vatRatePayloadSchema, type VatRatePayload, type VatRateView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateVatRateCommand } from "../application/create-vat-rate.js";
import { ListVatRatesQuery } from "../application/list-vat-rates.js";
import { RemoveVatRateCommand } from "../application/remove-vat-rate.js";
import { UpdateVatRateCommand } from "../application/update-vat-rate.js";

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
@Controller("vat-rates")
export class VatRateController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<VatRateView[]> {
    return this.queries.execute<ListVatRatesQuery, VatRateView[]>(new ListVatRatesQuery());
  }

  @Post()
  async create(@Body(new ZodBody(vatRatePayloadSchema)) body: VatRatePayload) {
    const id = await this.commands.execute<CreateVatRateCommand, string>(
      new CreateVatRateCommand(body),
    );
    return { id };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(vatRatePayloadSchema)) body: VatRatePayload,
  ) {
    await this.commands.execute<UpdateVatRateCommand, void>(new UpdateVatRateCommand(id, body));
    return { id };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    await this.commands.execute<RemoveVatRateCommand, void>(new RemoveVatRateCommand(id));
    return { id };
  }
}
