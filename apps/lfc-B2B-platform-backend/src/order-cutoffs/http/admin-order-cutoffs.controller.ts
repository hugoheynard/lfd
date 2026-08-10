import {
  type CreatedOrderCutoffResponse,
  type OrderCutoffPayload,
  orderCutoffPayloadSchema,
  type OrderCutoffView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  CreateOrderCutoffCommand,
  ListOrderCutoffsQuery,
  RemoveOrderCutoffCommand,
  UpdateOrderCutoffCommand,
} from "../application/order-cutoff.commands.js";

/**
 * Gestion **staff** des heures limites de commande (page Réglages → Retraits &
 * livraisons). Montage à deux surfaces habituel : `@Public()` désarme le guard
 * client, `AdminAuthGuard` réarme la porte staff.
 *
 * Une règle par ligne, et rien d'autre : ajouter un labo ou décaler le dimanche
 * doit rester de la saisie.
 */
@Controller("admin/order-cutoffs")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminOrderCutoffsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les règles, de la plus spécifique à la plus générale. */
  @Get()
  async list(): Promise<readonly OrderCutoffView[]> {
    return this.queries.execute<ListOrderCutoffsQuery, readonly OrderCutoffView[]>(
      new ListOrderCutoffsQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(orderCutoffPayloadSchema)) payload: OrderCutoffPayload,
  ): Promise<CreatedOrderCutoffResponse> {
    const id = await this.commands.execute<CreateOrderCutoffCommand, string>(
      new CreateOrderCutoffCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(orderCutoffPayloadSchema)) payload: OrderCutoffPayload,
  ): Promise<void> {
    await this.commands.execute<UpdateOrderCutoffCommand, void>(
      new UpdateOrderCutoffCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveOrderCutoffCommand, void>(new RemoveOrderCutoffCommand(id));
  }
}
