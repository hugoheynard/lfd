import type { DeliveryLoadingRoundView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DriverRoundWall } from "../../domain/ports/driver-round-wall.js";
import { assertDriverRound } from "../driver-loading-support.js";
import { GetDeliveryLoadingRoundHandler } from "./get-delivery-loading-round.handler.js";
import { GetDeliveryLoadingRoundQuery } from "./get-delivery-loading-round.query.js";
import { GetMyLoadingRoundQuery } from "./get-my-loading-round.query.js";

/**
 * **Le chargement de MA tournée** (`parcours-du-livreur.md`, PL1 — « Charger »
 * depuis « Ma tournée »). Le mur du livreur, puis LA MÊME lecture que l'écran
 * de chargement (`GetDeliveryLoadingRoundQuery`) : une vue, une logique, deux
 * portes. Une lecture.
 *
 * @throws {DriverRoundNotFoundError} tournée absente ou à un autre.
 */
@QueryHandler(GetMyLoadingRoundQuery)
export class GetMyLoadingRoundHandler implements IQueryHandler<
  GetMyLoadingRoundQuery,
  DeliveryLoadingRoundView
> {
  constructor(
    private readonly wall: DriverRoundWall,
    private readonly inner: GetDeliveryLoadingRoundHandler,
  ) {}

  async execute(query: GetMyLoadingRoundQuery): Promise<DeliveryLoadingRoundView> {
    await assertDriverRound(this.wall, query.staffUserId, query.roundId);
    return this.inner.execute(new GetDeliveryLoadingRoundQuery(query.roundId));
  }
}
