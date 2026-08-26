import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";
import {
  createSalesContextPayloadSchema,
  updateSalesContextPayloadSchema,
  type CreateSalesContextPayload,
  type SalesContextAdminView,
  type SalesContextView,
  type UpdateSalesContextPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateSalesContextCommand } from "../application/create-sales-context.js";
import { RemoveSalesContextCommand } from "../application/remove-sales-context.js";
import { UpdateSalesContextCommand } from "../application/update-sales-context.js";
import { isRootContext } from "../domain/value-objects/bootstrap-contexts.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";

/**
 * Les **contextes de vente** — le registre, en lecture ET en écriture.
 *
 * Il rend deux vues : `active` (maigre, pour dessiner les colonnes d'une
 * matrice) et la liste complète, hors-service compris, avec ce qui retient
 * chaque contexte. Une donnée qu'on ne peut pas voir n'est pas pilotable :
 * c'est exactement ce qui a laissé `channel_key` devenir une identité sans que
 * personne ne le remarque.
 *
 * ⚠️ Ce docblock disait « en lecture seule, et c'est une décision » — un
 * contexte se posait par migration. C0-d a tranché l'inverse : le registre
 * s'écrit d'ici, sous `catalog:write`. Ce qui reste vrai, c'est ce que
 * l'agrégat garde — la clé est immuable, la racine ineffaçable, et un contexte
 * encore offert ou vendu ne se supprime pas.
 */
@AdminSurface("catalog")
@Controller("sales-contexts")
export class SalesContextController {
  constructor(
    private readonly contexts: SalesContextRegistry,
    private readonly repository: SalesContextRepository,
    private readonly commands: CommandBus,
  ) {}

  /**
   * Les contextes **en service**, en vue maigre.
   *
   * C'est ce que tous les écrans lisent pour dessiner leurs colonnes. Distinct
   * de la liste d'administration ci-dessous, qui rend AUSSI les contextes hors
   * service et compte ce qui les retient — trois `groupBy` dont un écran de
   * matrice n'a que faire.
   *
   * Il vivait dans le `ReferenceController` du catalogue, avec les allergènes.
   * Un contrôleur qui sert deux référentiels dont il ne possède ni l'un ni
   * l'autre, c'est un tiroir : on y range ce qui n'a pas de place, et la place
   * finit par ne jamais être trouvée.
   */
  @Get("active")
  async activeSalesContexts(): Promise<SalesContextView[]> {
    const contexts = await this.contexts.active();
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      position: context.position,
    }));
  }

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
