import type { MonthlyInvoicesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { LegalEntityNotFoundError } from "../../domain/errors/accounting-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { ClosureBatchesReader } from "../../domain/ports/closure-batches.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { MonthlyInvoicesReader } from "../../domain/ports/monthly-invoices.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { closuresOfMonth } from "../../domain/services/month-closures.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { closureView } from "../monthly-closures-support.js";
import { GetMonthlyInvoicesQuery } from "./get-monthly-invoices.query.js";

/**
 * La dernière clôture du CALENDRIER de l'entité dont l'heure d'émission est
 * passée (M2 : celle d'au moins un payeur, ou du mensuel), ses factures, ses
 * payeurs signalés — ceux qui closent à cet instant, les seuls qu'elle
 * facture —, et sa tentative automatique (lot E4). Une lecture.
 *
 * Depuis M4c (§16.13), elle rend aussi les clôtures du mois en cours
 * (`closuresOfMonth`), chacune avec ses modes, ses factures, ses
 * signalements et ses lots : l'écran s'organise par clôture. La clôture à
 * émettre en fait toujours partie ; la vue du haut en est la copie.
 *
 * La période affichée est la plus longue de celles qui s'y closent
 * (`InvoicingCalendar.periodOf`) ; chaque facture porte celle de son payeur.
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
    private readonly batches: ClosureBatchesReader,
    private readonly clock: Clock,
  ) {}

  /** @throws {LegalEntityNotFoundError} l'entité n'existe pas. */
  async execute(query: GetMonthlyInvoicesQuery): Promise<MonthlyInvoicesView> {
    const entityId = query.legalEntityId;
    if ((await this.entities.byId(entityId)) === null) {
      throw new LegalEntityNotFoundError(entityId);
    }
    const now = this.clock.now();
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      entityId,
    );
    const toInvoice = calendar.closureToInvoice(now);
    const shown = closuresOfMonth(calendar, now);
    const batches = await this.batches.ofClosures(entityId, shown);
    const closures = await Promise.all(
      shown.map(async (closesAt) =>
        closureView(
          calendar,
          closesAt,
          await this.reader.ofPeriod(entityId, closesAt),
          batches,
          now,
        ),
      ),
    );
    // `closuresOfMonth` la contient toujours ; la relire sinon garde la vue juste.
    const current =
      closures.find((closure) => closure.periodClosesAt === toInvoice.toISOString()) ??
      closureView(
        calendar,
        toInvoice,
        await this.reader.ofPeriod(entityId, toInvoice),
        batches,
        now,
      );
    return { ...current, closures };
  }
}
