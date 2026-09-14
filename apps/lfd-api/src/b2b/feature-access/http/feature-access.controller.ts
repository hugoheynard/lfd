import type { FeatureLevelsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { Throttle } from "@nestjs/throttler";

import { Public } from "../../../platform/auth/public.decorator.js";
import { GetFeatureLevelsQuery } from "../application/queries/get-feature-levels.query.js";

/**
 * Lecture **publique** des niveaux globaux — l'app cliente en a besoin avant
 * toute connexion pour savoir quoi montrer.
 *
 * Sans exemption, par construction : il n'y a pas de `Principal` ici, et la
 * réponse ne porte que des niveaux. Rien n'y dit qu'une liste d'adresses existe.
 *
 * Surface anonyme ⇒ throttle resserré (60/min/IP), comme les zones de livraison.
 */
@Controller("feature-access")
@Public()
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class FeatureAccessController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  levels(): Promise<FeatureLevelsView> {
    return this.queries.execute<GetFeatureLevelsQuery, FeatureLevelsView>(
      new GetFeatureLevelsQuery(),
    );
  }
}
