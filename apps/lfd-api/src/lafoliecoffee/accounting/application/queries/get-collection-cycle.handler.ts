import type { CollectionBatchView, CollectionCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { readLotPayerModes } from "../lot-payer-modes-support.js";
import { GetCollectionCycleQuery } from "./collection-batch-queries.js";

/**
 * Les lots d'une entité et les commandes écartées — l'écran du cycle. Chaque
 * lot porte les modes des clients qu'il prélève (Hugo, 2026-10-12), lus sur
 * le calendrier de l'entité et la période rangée de chaque facture. Le rejet
 * déclaré d'un lot nomme son auteur par l'annuaire (une lecture par vue).
 */
@QueryHandler(GetCollectionCycleQuery)
export class GetCollectionCycleHandler implements IQueryHandler<
  GetCollectionCycleQuery,
  CollectionCycleView
> {
  constructor(
    private readonly batches: CollectionBatchReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly periods: InvoicePeriodsReader,
    private readonly authors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetCollectionCycleQuery): Promise<CollectionCycleView> {
    const [stored, exclusions, calendar] = await Promise.all([
      this.batches.list(query.legalEntityId),
      this.batches.exclusions(),
      readInvoicingCalendar(
        { modeDates: this.modeDates, payerModes: this.payerModes },
        query.legalEntityId,
      ),
    ]);
    const modes = await readLotPayerModes(
      this.periods,
      calendar,
      stored.map((batch) => ({
        payerRefs: batch.payerRefs,
        closesAt: new Date(batch.cycleClosesAt),
      })),
    );
    const authors = await this.authors.identify(
      stored.map((batch) => batch.rejection?.byStaffId ?? null),
    );
    const batches = stored.map(
      ({ payerRefs: _refs, rejection, ...batch }, index): CollectionBatchView => ({
        ...batch,
        payerModes: modes[index] ?? [],
        rejection:
          rejection === null
            ? null
            : {
                at: rejection.at,
                reason: rejection.reason,
                byName: authors.nameOf(rejection.byStaffId),
              },
      }),
    );
    return { batches, exclusions };
  }
}
