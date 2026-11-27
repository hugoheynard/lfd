import type { ShopOptionGroupsView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";

import { ActingCompany } from "../../../platform/auth/acting-company.decorator.js";
import { Public } from "../../../platform/auth/public.decorator.js";
import { ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReadShopOptionGroupsQuery } from "../application/queries/read-shop-option-groups.query.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";

const VISITOR_AUDIENCES = ["pro"] as const satisfies readonly ShopAudience[];

/** Comme `/shop/catalogue` : `pro` seul, absent = la vitrine publique, autre valeur = 400. */
const audienceQuerySchema = z
  .enum(
    VISITOR_AUDIENCES,
    `audience inconnue : « audience » n'accepte que ${VISITOR_AUDIENCES.join(", ")} (absent = la vitrine publique)`,
  )
  .optional();

/**
 * **Les options du rayon d'un visiteur**, sans jeton — la même vitrine que
 * `GET /shop/catalogue`, qui ne lit jamais l'appelant (`?audience=pro` pour la
 * visite pro, au même titre que le tarif pro de base qu'elle montre).
 *
 * Une route à part du rayon : le rayon est gardé en cache et tiré de
 * l'instantané du catalogue, dont le miroir des options ne fait pas partie.
 * Pas de `Cache-Control` public : la réponse garde le `private` du
 * middleware. Surface anonyme ⇒ le throttle resserré du rayon.
 */
@Controller("shop/catalogue/options")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class ShopOptionGroupsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(
    @Query("audience", new ZodQuery(audienceQuerySchema)) audience: ShopAudience | undefined,
  ): Promise<ShopOptionGroupsView> {
    return this.queries.execute<ReadShopOptionGroupsQuery, ShopOptionGroupsView>(
      new ReadShopOptionGroupsQuery({ kind: "visitor", audience: audience ?? "public" }),
    );
  }
}

/**
 * **Les options du rayon d'un client reconnu**, à la clientèle de sa société —
 * murée, et la société vient du contexte de la requête (`@ActingCompany`),
 * jamais de l'URL. Sans société résolue (espace perso, rattachement ambigu),
 * les options du public, comme son rayon.
 */
@Controller("shop/catalogue/options")
export class MyShopOptionGroupsController {
  constructor(private readonly queries: QueryBus) {}

  @Get("mine")
  read(@ActingCompany() companyId: string | null): Promise<ShopOptionGroupsView> {
    return this.queries.execute<ReadShopOptionGroupsQuery, ShopOptionGroupsView>(
      new ReadShopOptionGroupsQuery({ kind: "recognised", companyId }),
    );
  }
}
