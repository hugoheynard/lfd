import {
  orderPreflightPayloadSchema,
  type OrderPreflightPayload,
  type OrderPreflightView,
} from "@lfd/contracts";
import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { PreflightOrderAlertsQuery } from "../application/queries/preflight-order-alerts.query.js";

/**
 * `POST /orders/preflight` — le **contrôle de panier** du client.
 *
 * L'adresse appartient à la famille des commandes, mais le contrôleur vit dans
 * `alerts/` : ce qu'il rend, ce sont des règles d'alerte, et faire appeler
 * `alerts` par `orders` inverserait la dépendance qu'on tient depuis le début
 * (`orders` publie un événement, `alerts` l'écoute — jamais l'inverse). Une URL
 * n'est pas une frontière de module.
 *
 * `POST` pour un calcul sans écriture : le panier est le corps de la requête, et
 * quarante lignes n'ont pas leur place dans une query string.
 *
 * Le `companyId` du corps n'est **jamais** cru sur parole — le handler vérifie
 * l'appartenance du demandeur avant de comparer quoi que ce soit.
 */
@Controller("orders")
export class OrderPreflightController {
  constructor(private readonly queries: QueryBus) {}

  @Post("preflight")
  @HttpCode(HttpStatus.OK)
  async preflight(
    @CurrentUser() user: Principal,
    @Body(new ZodBody(orderPreflightPayloadSchema)) payload: OrderPreflightPayload,
  ): Promise<OrderPreflightView> {
    return this.queries.execute<PreflightOrderAlertsQuery, OrderPreflightView>(
      new PreflightOrderAlertsQuery(user.userId, payload),
    );
  }
}
