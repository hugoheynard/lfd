import type { DepartureView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DepartureCandidatesReader } from "../../channels/commerce/index.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { departureViewOf } from "../departure-view.js";
import { GetDepartureQuery } from "./get-departure.query.js";

/** Le départ tel qu'il vaut maintenant — cf. {@link departureViewOf}. */
@QueryHandler(GetDepartureQuery)
export class GetDepartureHandler implements IQueryHandler<GetDepartureQuery, DepartureView> {
  constructor(
    private readonly reader: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
  ) {}

  async execute(): Promise<DepartureView> {
    const [chosenId, candidates] = await Promise.all([
      this.reader.chosenPickupAddressId(),
      this.candidates.list(),
    ]);
    return departureViewOf(chosenId, candidates);
  }
}
