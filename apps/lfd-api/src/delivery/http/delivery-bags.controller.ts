import {
  type DeclareDeliveryBagsPayload,
  declareDeliveryBagsPayloadSchema,
  type DeliveryBagDetailView,
  type DeliveryOrderBagsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DeclareDeliveryBagsCommand } from "../application/commands/declare-delivery-bags.command.js";
import { VoidDeliveryBagCommand } from "../application/commands/void-delivery-bag.command.js";
import { GetDeliveryBagQuery } from "../application/queries/get-delivery-bag.query.js";
import { GetDeliveryOrderBagsQuery } from "../application/queries/get-delivery-order-bags.query.js";

/** La commande dont on lit les sacs, validée dans sa FORME. */
const orderQuerySchema = z.object({ commande: z.string().trim().min(1, "commande requise") });
type OrderQuery = z.infer<typeof orderQuerySchema>;

/** Ce que rend une déclaration : les sacs créés, pour imprimer leurs étiquettes. */
interface DeclaredBagsResponse {
  readonly bagIds: readonly string[];
}

/**
 * **Les sacs de livraison** — déclarer, lire, annuler
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, L4-C16,
 * L4-C19, L4-C21).
 *
 * Sous `delivery_loading` : lecture et écriture pour `admin` et `comptoir`
 * (Q21). Lire un sac ou les sacs d'une commande — la page imprimable, le QR
 * ouvert — n'écrit rien. Il n'injecte que les bus.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_loading")
export class DeliveryBagsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post("sacs")
  @HttpCode(HttpStatus.CREATED)
  async declare(
    @Body(new ZodBody(declareDeliveryBagsPayloadSchema)) payload: DeclareDeliveryBagsPayload,
  ): Promise<DeclaredBagsResponse> {
    const bagIds = await this.commands.execute<DeclareDeliveryBagsCommand, readonly string[]>(
      new DeclareDeliveryBagsCommand(payload),
    );
    return { bagIds };
  }

  @Get("sacs")
  orderBags(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryOrderBagsView> {
    return this.queries.execute<GetDeliveryOrderBagsQuery, DeliveryOrderBagsView>(
      new GetDeliveryOrderBagsQuery(query.commande),
    );
  }

  @Get("sac/:bagId")
  bag(@Param("bagId") bagId: string): Promise<DeliveryBagDetailView> {
    return this.queries.execute<GetDeliveryBagQuery, DeliveryBagDetailView>(
      new GetDeliveryBagQuery(bagId),
    );
  }

  @Post("sacs/:bagId/annulation")
  @HttpCode(HttpStatus.NO_CONTENT)
  async void(@Param("bagId") bagId: string): Promise<void> {
    await this.commands.execute<VoidDeliveryBagCommand, void>(new VoidDeliveryBagCommand(bagId));
  }
}
