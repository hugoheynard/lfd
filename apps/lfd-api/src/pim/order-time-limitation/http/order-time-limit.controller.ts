import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  orderTimeLimitPayloadSchema,
  type OrderTimeLimitPayload,
  type OrderTimeLimitView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListOrderTimeLimitsQuery } from "../application/list-order-time-limits.js";
import { RemoveOrderTimeLimitCommand } from "../application/remove-order-time-limit.js";
import { SetOrderTimeLimitCommand } from "../application/set-order-time-limit.js";

/**
 * **Points d'arrêt de prise de commande** — jusqu'à quand on accepte une
 * commande, par portée du catalogue.
 *
 * `PUT` sans identifiant, et c'est délibéré : la **portée** est la clé, pas un
 * identifiant technique. Un écran qui pose « la viennoiserie ferme à 16 h » ne
 * doit pas avoir à savoir si quelqu'un l'a déjà posée — la question n'a aucun
 * sens pour lui, et l'obliger à y répondre le ferait se tromper une fois sur
 * deux. Le `DELETE`, lui, vise l'identifiant : on retire une ligne qu'on a sous
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
  list(): Promise<readonly OrderTimeLimitView[]> {
    return this.queries.execute<ListOrderTimeLimitsQuery, readonly OrderTimeLimitView[]>(
      new ListOrderTimeLimitsQuery(),
    );
  }

  @Put()
  async set(
    @Body(new ZodBody(orderTimeLimitPayloadSchema)) body: OrderTimeLimitPayload,
  ): Promise<{ id: string }> {
    const id = await this.commands.execute<SetOrderTimeLimitCommand, string>(
      new SetOrderTimeLimitCommand(body),
    );
    return { id };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveOrderTimeLimitCommand, void>(
      new RemoveOrderTimeLimitCommand(id),
    );
  }
}
