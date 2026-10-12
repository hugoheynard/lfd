import type { MonthlyInvoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingRhythmReader } from "../../domain/ports/billing-rhythm.reader.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import {
  closureToInvoice,
  invoicedPeriodOf,
  invoicingMomentOf,
  periodLabelOf,
} from "../../domain/services/invoicing-closures.js";
import { GetMonthlyInvoicesQuery } from "./get-monthly-invoices.query.js";

/**
 * La dernière clôture de l'entité dont l'heure d'émission est passée (R3 :
 * sous SON rythme), ses factures, ses payeurs signalés, et sa tentative
 * automatique (lot E4). Une lecture.
 */
@QueryHandler(GetMonthlyInvoicesQuery)
export class GetMonthlyInvoicesHandler implements IQueryHandler<
  GetMonthlyInvoicesQuery,
  MonthlyInvoicesView
> {
  constructor(
    private readonly rhythms: BillingRhythmReader,
    private readonly reader: MonthlyInvoicesReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {LegalEntityNotFoundError} l'entité n'existe pas. */
  async execute(query: GetMonthlyInvoicesQuery): Promise<MonthlyInvoicesView> {
    const setting = await this.rhythms.timelineOf(query.legalEntityId);
    if (setting === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const period = invoicedPeriodOf(closureToInvoice(this.clock.now(), setting), setting);
    const read = await this.reader.ofPeriod(query.legalEntityId, period.closesAt);
    return {
      periodClosesAt: period.closesAt.toISOString(),
      periodStartsAt: period.startsAt.toISOString(),
      periodLabel: periodLabelOf(period),
      issuableFrom: invoicingMomentOf(period.closesAt).toISOString(),
      floorAt: read.floorAt?.toISOString() ?? null,
      open: read.floorAt !== null && read.floorAt.getTime() < period.closesAt.getTime(),
      invoices: read.invoices,
      signaled: read.signaled,
      autopilotRun: read.autopilotRun,
    };
  }
}
