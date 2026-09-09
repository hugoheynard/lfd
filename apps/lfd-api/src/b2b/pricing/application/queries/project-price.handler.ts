import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PriceProjectionView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { PriceProjectionQuery } from "./price-projection.query.js";
import { ProjectPriceQuery } from "./project-price.query.js";

/**
 * L'horloge descend ici et n'est plus au contrôleur : traduire du HTTP et
 * décider d'un instant sont deux raisons de changer, et la seconde appartient au
 * cas d'usage.
 *
 * ⚠️ `PriceProjectionQuery` est le **service** de projection, pas une question du
 * bus, malgré son suffixe. Il garde son nom : la documentation le cite.
 */
@QueryHandler(ProjectPriceQuery)
export class ProjectPriceHandler implements IQueryHandler<ProjectPriceQuery, PriceProjectionView> {
  constructor(
    private readonly projection: PriceProjectionQuery,
    private readonly clock: Clock,
  ) {}

  execute(query: ProjectPriceQuery): Promise<PriceProjectionView> {
    return this.projection.project(query.payload, this.clock.now());
  }
}
