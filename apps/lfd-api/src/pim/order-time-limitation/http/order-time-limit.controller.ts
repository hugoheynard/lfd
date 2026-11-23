import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  type EffectiveOrderTimeLimitView,
  type GeneralOrderCutoffView,
  orderTimeLimitExclusionPayloadSchema,
  type OrderTimeLimitExclusionPayload,
  type OrderTimeLimitListItem,
  orderTimeLimitPayloadSchema,
  type OrderTimeLimitPayload,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ExcludeProductFromLimitCommand } from "../application/exclude-product-from-limit.js";
import { ExplainProductOrderTimeLimitQuery } from "../application/explain-product-order-time-limit.js";
import { IncludeProductInLimitCommand } from "../application/include-product-in-limit.js";
import { GetGeneralOrderCutoffQuery } from "../application/get-general-order-cutoff.js";
import { ListOrderTimeLimitsQuery } from "../application/list-order-time-limits.js";
import { ArchiveOrderTimeLimitCommand } from "../application/archive-order-time-limit.js";
import { RestoreOrderTimeLimitCommand } from "../application/restore-order-time-limit.js";
import { SetOrderTimeLimitCommand } from "../application/set-order-time-limit.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **Points d'arrêt de prise de commande** — jusqu'à quand on accepte une
 * commande, par portée du catalogue.
 *
 * `PUT` sans identifiant, et c'est délibéré : la **portée** est la clé, pas un
 * identifiant technique. Un écran qui pose « la viennoiserie ferme à 16 h » ne
 * doit pas avoir à savoir si quelqu'un l'a déjà posée — la question n'a aucun
 * sens pour lui, et l'obliger à y répondre le ferait se tromper une fois sur
 * deux. Le `DELETE`, lui, vise l'identifiant : on archive une ligne qu'on a sous
 * les yeux.
 *
 * Surface staff murée par `@AdminSurface("pim_catalog")` : c'est une décision de
 * catalogue — ce qu'on accepte de produire et quand — et non une décision
 * comptable ni un réglage de plateforme.
 */
@AdminSurface("pim_catalog")
@Controller("order-time-limits")
export class OrderTimeLimitController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly OrderTimeLimitListItem[]> {
    return this.queries.execute<ListOrderTimeLimitsQuery, readonly OrderTimeLimitListItem[]>(
      new ListOrderTimeLimitsQuery(),
    );
  }

  /** La limite effective d'un produit et sa provenance, pour sa fiche. */
  @Get("effective/:productId")
  effective(@Param("productId") productId: string): Promise<EffectiveOrderTimeLimitView> {
    return this.queries.execute<ExplainProductOrderTimeLimitQuery, EffectiveOrderTimeLimitView>(
      new ExplainProductOrderTimeLimitQuery(productId),
    );
  }

  /**
   * La règle générale du commerce, en lecture : « toute la production » se
   * règle dans Réglages › Commandes › Heure limite, et cette page la montre
   * sans demander le droit de la régler.
   */
  @Get("general-cutoff")
  generalCutoff(): Promise<GeneralOrderCutoffView> {
    return this.queries.execute<GetGeneralOrderCutoffQuery, GeneralOrderCutoffView>(
      new GetGeneralOrderCutoffQuery(),
    );
  }

  @Put()
  @Idempotent(
    "pose la règle d'une portée (une ligne par portée) : rejouée à l'identique, ni écriture, ni fait, ni émission ; rend le même identifiant",
  )
  async set(
    @Body(new ZodBody(orderTimeLimitPayloadSchema)) body: OrderTimeLimitPayload,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<SetOrderTimeLimitCommand, string>(
      new SetOrderTimeLimitCommand(body),
    );
    return { id };
  }

  /**
   * **Archive** la limite : elle cesse de s'appliquer. La route garde son verbe
   * `DELETE` et sa réponse (204) : une limite ne se supprime plus.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("archive la limite : rejouée, elle l'est déjà et rien ne s'écrit ni ne s'émet")
  async archive(@Param("id") id: string): Promise<void> {
    await this.commands.execute<ArchiveOrderTimeLimitCommand, void>(
      new ArchiveOrderTimeLimitCommand(id),
    );
  }

  @Post(":id/restore")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "remet la limite en vigueur : rejouée, elle l'est déjà et rien ne s'écrit ni ne s'émet",
  )
  async restore(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RestoreOrderTimeLimitCommand, void>(
      new RestoreOrderTimeLimitCommand(id),
    );
  }

  /** Exclut un produit d'une limite de famille. */
  @Post(":id/exclusions")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("exclut le produit : rejouée, il l'est déjà et rien ne s'écrit ni ne s'émet")
  async exclude(
    @Param("id") id: string,
    @Body(new ZodBody(orderTimeLimitExclusionPayloadSchema)) body: OrderTimeLimitExclusionPayload,
  ): Promise<void> {
    await this.commands.execute<ExcludeProductFromLimitCommand, void>(
      new ExcludeProductFromLimitCommand(id, body.productId),
    );
  }

  /**
   * Réintègre le produit : son exclusion est retirée, jamais effacée — le verbe
   * `DELETE` dit ce que l'écran voit disparaître, comme l'archive d'une limite.
   */
  @Delete(":id/exclusions/:productId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent("réintègre le produit : rejouée, il n'est plus exclu et rien ne s'écrit ni ne s'émet")
  async include(@Param("id") id: string, @Param("productId") productId: string): Promise<void> {
    await this.commands.execute<IncludeProductInLimitCommand, void>(
      new IncludeProductInLimitCommand(id, productId),
    );
  }
}
