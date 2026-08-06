import {
  type OrderView,
  type PlaceOrderPayload,
  placeOrderPayloadSchema,
  type PlacedOrderResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../infra/auth/current-user.decorator.js";
import type { Principal } from "../../infra/auth/principal.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from "../application/commands/place-order.command.js";
import { ListCompanyOrdersQuery } from "../application/queries/list-company-orders.query.js";

/**
 * Commandes d'une entreprise.
 *
 * Endpoints **murés** au niveau **membre** (l'entreprise est dans l'URL, vérifiée
 * contre les memberships du demandeur). Passer commande exige en plus que
 * l'entreprise soit **activée** (le handler s'en charge). L'`userId` vient toujours
 * du `Principal`, jamais du corps ; les prix sont ré-résolus au serveur.
 */
@Controller("companies")
export class OrdersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Liste les commandes de l'entreprise (membre). */
  @Get(":companyId/orders")
  async list(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
  ): Promise<readonly OrderView[]> {
    return this.queries.execute<ListCompanyOrdersQuery, readonly OrderView[]>(
      new ListCompanyOrdersQuery(user.userId, companyId),
    );
  }

  /** Passe une commande (membre + entreprise activée). */
  @Post(":companyId/orders")
  @HttpCode(HttpStatus.CREATED)
  async place(
    @CurrentUser() user: Principal,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(placeOrderPayloadSchema)) payload: PlaceOrderPayload,
  ): Promise<PlacedOrderResponse> {
    const placed = await this.commands.execute<PlaceOrderCommand, PlaceOrderResult>(
      new PlaceOrderCommand(user.userId, companyId, payload),
    );
    // `payment` n'est présent que pour une société `per_order` (carte requise) ;
    // on ne l'ajoute à la réponse que dans ce cas (exactOptionalPropertyTypes).
    return placed.payment === undefined
      ? { id: placed.id, orderNumber: placed.orderNumber }
      : { id: placed.id, orderNumber: placed.orderNumber, payment: placed.payment };
  }
}
