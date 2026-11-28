import { Injectable } from "@nestjs/common";

import { PlanVersionChainReader } from "../../domain/ports/plan-version-chain.reader.js";
import { PlanVersionComparison } from "../../domain/ports/plan-version-comparison.js";
import { diffPlanVersions } from "../../domain/services/plan-version-diff/plan-version-diff.js";
import type { PlanVersionDiff } from "../../domain/services/plan-version-diff/plan-version-diff.types.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * La comparaison, telle que le noyau l'implémente : la chaîne entière lue
 * d'un bloc, puis `diffPlanVersions`, qui juge l'ordre et les versions
 * manquantes.
 */
@Injectable()
export class ChainPlanVersionComparison extends PlanVersionComparison {
  constructor(private readonly chain: PlanVersionChainReader) {
    super();
  }

  async compare(day: ServiceDay, from: number, to: number): Promise<PlanVersionDiff> {
    return diffPlanVersions(await this.chain.allOf(day), from, to);
  }
}
