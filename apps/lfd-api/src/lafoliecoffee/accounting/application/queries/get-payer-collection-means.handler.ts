import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PayerCollectionMeansView } from "@lfd/contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingPayerNotFoundError } from "../../domain/errors/billing-mode-errors.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { PayerCollectionMeansReader } from "../../domain/ports/payer-collection-means.reader.js";
import { PayerStandingReader } from "../../domain/ports/payer-standing.reader.js";
import { collectionMeansPayerOf } from "../../domain/services/collection-means-payer.js";
import { collectionMeansAt } from "../../domain/services/collection-means-timeline.js";
import { GetPayerCollectionMeansQuery } from "./get-payer-collection-means.query.js";

/**
 * Le moyen d'un compte : en vigueur (prélèvement s'il n'a rien changé),
 * depuis quand, et le programmé. Un site qui suit la facturation de son
 * principal lit le moyen du principal (V1), qui est nommé.
 */
@QueryHandler(GetPayerCollectionMeansQuery)
export class GetPayerCollectionMeansHandler implements IQueryHandler<
  GetPayerCollectionMeansQuery,
  PayerCollectionMeansView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly standings: PayerStandingReader,
    private readonly payerMeans: PayerCollectionMeansReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetPayerCollectionMeansQuery): Promise<PayerCollectionMeansView> {
    if ((await this.entities.byId(query.legalEntityId)) === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const now = this.clock.now();
    const standing = await this.standings.standingOf(query.companyId, now);
    if (standing === null) {
      throw new BillingPayerNotFoundError(query.companyId);
    }
    const { payer, followed } = collectionMeansPayerOf(standing, now);
    const entries = await this.payerMeans.entriesOf(query.legalEntityId, payer.id);
    const inForce = collectionMeansAt(entries, now);
    const scheduled = entries.find(
      (entry) => entry.cancelledAt === null && entry.effectiveFrom > now,
    );
    return {
      legalEntityId: query.legalEntityId,
      companyId: query.companyId,
      payerCompanyId: payer.id,
      followsPayer: followed ? payer : null,
      means: inForce.means,
      since: inForce.since?.toISOString() ?? null,
      scheduled:
        scheduled === undefined
          ? null
          : {
              means: scheduled.means,
              effectiveAt: scheduled.effectiveFrom.toISOString(),
              reason: scheduled.reason,
            },
    };
  }
}
