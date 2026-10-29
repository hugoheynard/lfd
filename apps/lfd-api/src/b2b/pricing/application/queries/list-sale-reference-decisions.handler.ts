import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { SaleReferenceDecisionView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import {
  SaleReferenceDecisionsReader,
  type StandingDecision,
} from "../../domain/ports/sale-reference-decisions.reader.js";
import { ListSaleReferenceDecisionsQuery } from "./list-sale-reference-decisions.query.js";

/**
 * Les décisions debout sur une référence, chacune avec le nom de la société
 * qu'elle vise. Lecture seule : reposer est un autre geste, explicite.
 */
@QueryHandler(ListSaleReferenceDecisionsQuery)
export class ListSaleReferenceDecisionsHandler implements IQueryHandler<
  ListSaleReferenceDecisionsQuery,
  readonly SaleReferenceDecisionView[]
> {
  constructor(
    private readonly decisions: SaleReferenceDecisionsReader,
    private readonly namer: PricedCompanyNamer,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: ListSaleReferenceDecisionsQuery,
  ): Promise<readonly SaleReferenceDecisionView[]> {
    const standing = await this.decisions.standingOn(query.saleReference, this.clock.now());
    const names = await this.namesOf(standing);
    return standing.map((decision) => viewOf(decision, names));
  }

  /** Une lecture par société citée, pas par décision. */
  private async namesOf(
    standing: readonly StandingDecision[],
  ): Promise<ReadonlyMap<string, string | null>> {
    const ids = [
      ...new Set(
        standing.flatMap((decision) => (decision.companyId === null ? [] : [decision.companyId])),
      ),
    ];
    const named = await Promise.all(
      ids.map(async (id) => [id, await this.namer.nameOf(id)] as const),
    );
    return new Map(named);
  }
}

function viewOf(
  decision: StandingDecision,
  names: ReadonlyMap<string, string | null>,
): SaleReferenceDecisionView {
  return {
    kind: decision.kind,
    id: decision.id,
    label: decision.label,
    companyId: decision.companyId,
    companyName: decision.companyId === null ? null : (names.get(decision.companyId) ?? null),
    validFrom: decision.validFrom?.toISOString() ?? null,
    validTo: decision.validTo?.toISOString() ?? null,
    paused: decision.paused,
  };
}
