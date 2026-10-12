import type { MonthlyInvoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { invoicingMomentOf, periodLabelOf } from "../../domain/services/invoicing-closures.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { GetMonthlyInvoicesQuery } from "./get-monthly-invoices.query.js";

/**
 * La dernière clôture du CALENDRIER de l'entité dont l'heure d'émission est
 * passée (M2 : celle d'au moins un payeur, ou du mensuel), ses factures, ses
 * payeurs signalés — ceux qui closent à cet instant, les seuls qu'elle
 * facture —, et sa tentative automatique (lot E4). Une lecture.
 *
 * La période affichée est la plus longue de celles qui s'y closent
 * (`InvoicingCalendar.periodOf`) : la vue ne porte encore qu'une période par
 * clôture ; celle de chaque payeur est l'affaire de l'écran (M4).
 */
@QueryHandler(GetMonthlyInvoicesQuery)
export class GetMonthlyInvoicesHandler implements IQueryHandler<
  GetMonthlyInvoicesQuery,
  MonthlyInvoicesView
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly reader: MonthlyInvoicesReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {LegalEntityNotFoundError} l'entité n'existe pas. */
  async execute(query: GetMonthlyInvoicesQuery): Promise<MonthlyInvoicesView> {
    if ((await this.entities.byId(query.legalEntityId)) === null) {
      throw new LegalEntityNotFoundError(query.legalEntityId);
    }
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      query.legalEntityId,
    );
    const period = calendar.periodOf(calendar.closureToInvoice(this.clock.now()));
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
