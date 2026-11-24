import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { RoadRoutingReadinessView } from "@lfd/contracts";

import { RoadRoutingReadiness } from "../../domain/ports/road-routing-readiness.js";
import { GetRoadRoutingReadinessQuery } from "./get-road-routing-readiness.query.js";

/**
 * **Le calcul routier est-il prêt ?** (décidé par Hugo le 2026-11-24) : un
 * sondage, qui ne réveille pas et n'attend pas — le réveil est l'affaire de
 * `POST …/wake`.
 */
@QueryHandler(GetRoadRoutingReadinessQuery)
export class GetRoadRoutingReadinessHandler implements IQueryHandler<
  GetRoadRoutingReadinessQuery,
  RoadRoutingReadinessView
> {
  constructor(private readonly readiness: RoadRoutingReadiness) {}

  async execute(_query: GetRoadRoutingReadinessQuery): Promise<RoadRoutingReadinessView> {
    return { ready: await this.readiness.isReady() };
  }
}
