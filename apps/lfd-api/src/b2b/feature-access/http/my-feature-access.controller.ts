import type { FeatureLevelsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { GetMyFeatureLevelsQuery } from "../application/queries/get-my-feature-levels.query.js";
import { featureSubjectOf } from "./feature-subject.js";

/**
 * `GET /feature-access/mine` — les niveaux du **client connecté**.
 *
 * Un contrôleur à part de `FeatureAccessController`, qui est `@Public()` au
 * niveau de la classe : une route publique ne résout aucun `Principal`, et
 * celle-ci en a besoin pour appliquer l'exemption. Même motif que
 * `MyShopCatalogueController` à côté de la vitrine publique.
 */
@Controller("feature-access")
export class MyFeatureAccessController {
  constructor(private readonly queries: QueryBus) {}

  @Get("mine")
  mine(@CurrentUser() user: Principal): Promise<FeatureLevelsView> {
    return this.queries.execute<GetMyFeatureLevelsQuery, FeatureLevelsView>(
      new GetMyFeatureLevelsQuery(featureSubjectOf(user)),
    );
  }
}
