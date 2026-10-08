import type { MonthlyInvoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import { invoicingMomentOf, monthToInvoice } from "../../domain/services/monthly-invoicing.js";
import { GetMonthlyInvoicesQuery } from "./get-monthly-invoices.query.js";

/**
 * Le dernier mois dont l'heure d'émission est passée, ses factures, ses
 * payeurs signalés, et sa tentative automatique (lot E4). Une lecture.
 */
@QueryHandler(GetMonthlyInvoicesQuery)
export class GetMonthlyInvoicesHandler implements IQueryHandler<
  GetMonthlyInvoicesQuery,
  MonthlyInvoicesView
> {
  constructor(
    private readonly reader: MonthlyInvoicesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetMonthlyInvoicesQuery): Promise<MonthlyInvoicesView> {
    const month = monthToInvoice(this.clock.now());
    const read = await this.reader.ofMonth(query.legalEntityId, month.toString());
    return {
      month: month.toString(),
      issuableFrom: invoicingMomentOf(month).toISOString(),
      floorAt: read.floorAt?.toISOString() ?? null,
      open: read.floorAt !== null && read.floorAt.getTime() < month.cycle().closesAt.getTime(),
      invoices: read.invoices,
      signaled: read.signaled,
      autopilotRun: read.autopilotRun,
    };
  }
}
