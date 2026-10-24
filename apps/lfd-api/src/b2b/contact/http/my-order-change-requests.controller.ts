import {
  type CreatedIdResponse,
  type OrderChangeRequestPayload,
  orderChangeRequestPayloadSchema,
  type OrderChangeRequestStatusResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { perAccountThrottleGuard } from "../../../platform/security/per-account-throttle.guard.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { RequestOrderChangeCommand } from "../application/commands/request-order-change.command.js";
import { GetMyOrderChangeRequestQuery } from "../application/queries/get-my-order-change-request.query.js";

/** Trois demandes par dix minutes et par COMPTE, comme un signalement. */
export const OrderChangeRequestThrottleGuard = perAccountThrottleGuard({
  name: "order-change-request",
  limit: 3,
  windowMs: 600_000,
});

/**
 * **Demander une modification de commande** après l'heure limite (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4) — et lire où
 * elle en est. La personne vient du jeton ; la société est celle de la
 * COMMANDE. Hors mur, `404`.
 */
@Controller("me/orders/:orderId/change-request")
export class MyOrderChangeRequestsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * `201` avec l'id de la demande ; `409` si la commande se modifie encore
   * directement, ne se modifie plus du tout, a changé depuis la composition,
   * ou si une demande attend déjà.
   */
  @Post()
  @UseGuards(OrderChangeRequestThrottleGuard)
  async request(
    @Param("orderId") orderId: string,
    @Body(new ZodBody(orderChangeRequestPayloadSchema)) payload: OrderChangeRequestPayload,
    @CurrentUser() principal: Principal,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<RequestOrderChangeCommand, string>(
      new RequestOrderChangeCommand(orderId, payload, { userId: principal.userId }),
    );
    return { id };
  }

  /** La dernière demande de cette commande, ou `{ request: null }`. */
  @Get()
  latest(
    @Param("orderId") orderId: string,
    @CurrentUser() principal: Principal,
  ): Promise<OrderChangeRequestStatusResponse> {
    return this.queries.execute<GetMyOrderChangeRequestQuery, OrderChangeRequestStatusResponse>(
      new GetMyOrderChangeRequestQuery(orderId, principal.userId),
    );
  }
}
