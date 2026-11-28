import { Injectable } from "@nestjs/common";

import { PlanVersionChainReader } from "../../domain/ports/plan-version-chain.reader.js";
import { PlanVersionListing } from "../../domain/ports/plan-version-listing.js";
import {
  type PlanVersionEntry,
  planVersionEntriesOf,
} from "../../domain/services/plan-version-entries.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/** La liste des versions, telle que le noyau l'implémente sur sa chaîne. */
@Injectable()
export class ChainPlanVersionListing extends PlanVersionListing {
  constructor(private readonly chain: PlanVersionChainReader) {
    super();
  }

  async listOf(day: ServiceDay): Promise<readonly PlanVersionEntry[]> {
    return planVersionEntriesOf(await this.chain.allOf(day));
  }
}
