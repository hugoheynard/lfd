import type { PublicStorefrontPageView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetPublicStorefrontPageQuery } from "../application/get-public-storefront-page.query.js";

/**
 * **La vitrine, pour la boutique** — la page composée d'un rayon (plan, D8).
 *
 * Publique : on regarde la boutique avant d'avoir un compte. Ce qui sort
 * d'ici, ce sont des formes, des positions et des contenus — jamais la
 * révision, les gabarits ou les objets archivés.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP) sous le défaut global,
 * comme les points de retrait publics.
 */
@Controller("shop/storefront")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class StorefrontController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * `shelfKey` : `all`, l'identifiant d'une famille du référentiel, ou
   * `op:<key>`. Pour un VISITEUR : les annonces d'une opération réservée aux
   * pros s'y éteignent — un client reconnu lit `/:shelfKey/mine`.
   */
  @Get(":shelfKey")
  page(@Param("shelfKey") shelfKey: string): Promise<PublicStorefrontPageView> {
    return this.queries.execute<GetPublicStorefrontPageQuery, PublicStorefrontPageView>(
      new GetPublicStorefrontPageQuery(shelfKey, null),
    );
  }
}
