import { Injectable } from "@nestjs/common";

import { PlanVersionChainReader } from "../../domain/ports/plan-version-chain.reader.js";
import { PlanVersionSummaries } from "../../domain/ports/plan-version-summaries.js";
import { diffPlanVersions } from "../../domain/services/plan-version-diff/plan-version-diff.js";
import {
  type PlanVersionDiffSummary,
  summarizePlanVersionDiff,
} from "../../domain/services/plan-version-diff/plan-version-diff-summary.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * Les résumés, tels que le noyau les implémente : la chaîne lue d'un bloc,
 * puis `diffPlanVersions` et `summarizePlanVersionDiff` par version de départ.
 */
@Injectable()
export class ChainPlanVersionSummaries extends PlanVersionSummaries {
  constructor(private readonly chain: PlanVersionChainReader) {
    super();
  }

  async since(
    day: ServiceDay,
    froms: readonly number[],
    to: number,
  ): Promise<ReadonlyMap<number, PlanVersionDiffSummary>> {
    if (froms.length === 0) {
      return new Map();
    }
    const versions = await this.chain.allOf(day);
    return new Map(
      [...new Set(froms)].map((from) => [
        from,
        summarizePlanVersionDiff(diffPlanVersions(versions, from, to)),
      ]),
    );
  }
}
