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
import { GetOrderQuery } from "../application/queries/get-order.query.js";
import { ListPersonalOrdersQuery } from "../application/queries/list-personal-orders.query.js";

/**
 * Commandes du **client connecté** — **zéro friction**.
 *
 * `POST /orders` passe une commande : l'entreprise est **optionnelle** (dans le
 * corps). Sans entreprise, la commande n'appartient qu'au client (mur =
 * `Principal.userId`) et se règle par carte ; avec une entreprise, le handler
 * exige d'en être **membre** (le `companyId` du corps, jamais un rôle du corps).
 * L'`userId` vient toujours du `Principal` ; les prix sont ré-résolus au serveur.
 */
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Passe une commande (personnelle, ou pour une entreprise dont on est membre). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async place(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(placeOrderPayloadSchema)) payload: PlaceOrderPayload,
  ): Promise<PlacedOrderResponse> {
    const placed = await this.commands.execute<PlaceOrderCommand, PlaceOrderResult>(
      new PlaceOrderCommand(user.userId, payload),
    );
    // `payment` n'est présent que si une carte est requise (pas d'entreprise, ou
    // entreprise non active / per_order) ; on ne l'ajoute que dans ce cas
    // (exactOptionalPropertyTypes).
    return placed.payment === undefined
      ? { id: placed.id, orderNumber: placed.orderNumber }
      : { id: placed.id, orderNumber: placed.orderNumber, payment: placed.payment };
  }

  /** Liste les commandes **personnelles** du client (sans entreprise). */
  @Get("mine")
  async mine(@CurrentUser() user: Principal): Promise<readonly OrderView[]> {
    return this.queries.execute<ListPersonalOrdersQuery, readonly OrderView[]>(
      new ListPersonalOrdersQuery(user.userId),
    );
  }

  /**
   * Une commande, si le demandeur a le droit de la voir : la sienne (personnelle),
   * ou celle d'une entreprise dont il est membre. Sinon **404**, sans distinguer
   * l'inexistante de l'interdite.
   *
   * Déclarée **après** `mine` : Nest apparie dans l'ordre de déclaration, et
   * `:id` avalerait sinon le mot `mine`.
   */
  @Get(":id")
  async one(@CurrentUser() user: Principal, @Param("id") id: string): Promise<OrderView> {
    return this.queries.execute<GetOrderQuery, OrderView>(new GetOrderQuery(user.userId, id));
  }
}
