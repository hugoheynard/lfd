import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { VolumeCommitmentView } from "@lfd/contracts";

import { VolumeCommitmentsQuery } from "./volume-commitments.query.js";
import { ListVolumeCommitmentsQuery } from "./list-volume-commitments.query.js";

/**
 * ⚠️ `VolumeCommitmentsQuery` est le **service** de suivi, pas une question du
 * bus : il garde son nom.
 */
@QueryHandler(ListVolumeCommitmentsQuery)
export class ListVolumeCommitmentsHandler implements IQueryHandler<
  ListVolumeCommitmentsQuery,
  readonly VolumeCommitmentView[]
> {
  constructor(private readonly commitments: VolumeCommitmentsQuery) {}

  execute(query: ListVolumeCommitmentsQuery): Promise<readonly VolumeCommitmentView[]> {
    return this.commitments.forCompany(query.companyId);
  }
}
