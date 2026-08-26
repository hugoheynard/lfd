import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  createSalesContextPayloadSchema,
  updateSalesContextPayloadSchema,
  type CreateSalesContextPayload,
  type SalesContextAdminView,
  type UpdateSalesContextPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { CreateSalesContextCommand } from "../application/create-sales-context.js";
import { RemoveSalesContextCommand } from "../application/remove-sales-context.js";
import { UpdateSalesContextCommand } from "../application/update-sales-context.js";
import { isRootContext } from "../domain/value-objects/bootstrap-contexts.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";

/**
 * Les **contextes de vente**, vus depuis l'administration.
 *
 * Distinct de `ReferenceController`, qui rend les contextes *en service* pour
 * dessiner la matrice. Ici on rend TOUT, hors-service compris : le registre
 * décide désormais de ce qu'on peut vendre, et une donnée qu'on ne peut pas
 * voir n'est pas pilotable. C'est exactement ce qui a laissé `channel_key`
 * devenir une identité sans que personne ne le remarque.
 *
 * **En lecture seule, et c'est une décision.** Un contexte se pose par
 * migration : l'ouvrir à un formulaire rendrait possible d'en inventer un que
 * ni Shopify ni la facturation ne savent traiter. L'écran montre, il ne crée
 * pas.
 */
@AdminSurface("catalog")
@Controller("catalogue/sales-contexts")
export class SalesContextController {
  constructor(
    private readonly contexts: SalesContextRegistry,
    private readonly repository: SalesContextRepository,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  async list(): Promise<SalesContextAdminView[]> {
    const [contexts, offered, usage] = await Promise.all([
      this.contexts.all(),
      this.contexts.offeredByLocations(),
      this.repository.usageByKey(),
    ]);
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      position: context.position,
      active: context.active,
      shopifyProjected: context.shopifyProjected,
      handleSuffix: context.handleSuffix,
      root: isRootContext(context.key),
      // Un contexte global n'est offert par aucun lieu, et ce zéro-là n'est pas
      // un manque : il n'a pas de sens à demander. L'écran le sait par
      // `perLocation` et n'affiche pas le compte.
      offeredByLocations: offered.get(context.key) ?? 0,
      // Ce qui le RETIENT — l'écran doit le dire avant le geste, plutôt que de
      // laisser le refus l'apprendre après le clic.
      soldBy: usage.get(context.key)?.soldBy ?? 0,
      ratedBy: usage.get(context.key)?.ratedBy ?? 0,
    }));
  }

  @Post()
  async create(
    @Body(new ZodBody(createSalesContextPayloadSchema)) body: CreateSalesContextPayload,
  ) {
    const key = await this.commands.execute<CreateSalesContextCommand, string>(
      new CreateSalesContextCommand(body),
    );
    return { key };
  }

  @Put(":key")
  async update(
    @Param("key") key: string,
    @Body(new ZodBody(updateSalesContextPayloadSchema)) body: UpdateSalesContextPayload,
  ) {
    await this.commands.execute<UpdateSalesContextCommand, void>(
      new UpdateSalesContextCommand(key, body),
    );
    return { key };
  }

  @Delete(":key")
  async remove(@Param("key") key: string) {
    await this.commands.execute<RemoveSalesContextCommand, void>(
      new RemoveSalesContextCommand(key),
    );
    return { key };
  }
}
