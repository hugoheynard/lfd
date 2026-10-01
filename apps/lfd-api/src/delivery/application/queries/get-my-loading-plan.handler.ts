import type { DeliveryLoadingPlanView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DriverRoundWall } from "../../domain/ports/driver-round-wall.js";
import { assertDriverRound } from "../driver-loading-support.js";
import { GetDeliveryLoadingPlanHandler } from "./get-delivery-loading-plan.handler.js";
import { GetDeliveryLoadingPlanQuery } from "./get-delivery-loading-plan.query.js";
import { GetMyLoadingPlanQuery } from "./get-my-loading-plan.query.js";

/**
 * **Le plan de chargement de MA tournée** (`parcours-du-livreur.md`, PL1). Le
 * mur du livreur, puis LA MÊME lecture que l'écran de chargement
 * (`GetDeliveryLoadingPlanQuery`). Une lecture.
 *
 * @throws {DriverRoundNotFoundError} tournée absente ou à un autre.
 */
@QueryHandler(GetMyLoadingPlanQuery)
export class GetMyLoadingPlanHandler implements IQueryHandler<
  GetMyLoadingPlanQuery,
  DeliveryLoadingPlanView
> {
  constructor(
    private readonly wall: DriverRoundWall,
    private readonly inner: GetDeliveryLoadingPlanHandler,
  ) {}

  async execute(query: GetMyLoadingPlanQuery): Promise<DeliveryLoadingPlanView> {
    await assertDriverRound(this.wall, query.staffUserId, query.roundId);
    return this.inner.execute(new GetDeliveryLoadingPlanQuery(query.roundId));
  }
}
