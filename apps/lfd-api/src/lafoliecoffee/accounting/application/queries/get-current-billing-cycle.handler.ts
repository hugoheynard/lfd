import type { BillingCycleView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { RecordedClosureReader } from "../../domain/ports/recorded-closure.reader.js";
import { calendarCycleAt } from "../../domain/services/calendar-cycles.js";
import { statementCalendar } from "../statement-period-support.js";
import { GetCurrentBillingCycleQuery } from "./billing-cycle-queries.js";

/**
 * Rend le cycle qui contient l'instant courant, **sur le calendrier de
 * l'entité en service** (plan `plan-rythme-de-facturation.md`, §16.9, M4a) :
 * la même suite que le lot (`InvoicingCalendar`, M3), aucun payeur n'étant
 * nommé.
 *
 * La clôture précédente est la dernière ENREGISTRÉE — celle du dernier lot
 * vivant, toutes entités confondues : la route ne nomme pas d'entité, et une
 * seule encaisse (Q4 du plan `lot-de-prelevement-fige.md`, 2026-10-05) ; c'est
 * aussi elle dont le calendrier est lu (`statementCalendar`). Sans lot, la
 * clôture du calendrier qui précède.
 *
 * L'instant vient du port `Clock`, jamais de `new Date()` : c'est ce qui rend le
 * cycle éprouvable sur un passage à l'heure d'été sans attendre mars.
 */
@QueryHandler(GetCurrentBillingCycleQuery)
export class GetCurrentBillingCycleHandler implements IQueryHandler<
  GetCurrentBillingCycleQuery,
  BillingCycleView
> {
  constructor(
    private readonly clock: Clock,
    private readonly closures: RecordedClosureReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
  ) {}

  async execute(): Promise<BillingCycleView> {
    const calendar = await statementCalendar({
      issuers: this.issuers,
      modeDates: this.modeDates,
      payerModes: this.payerModes,
    });
    const cycle = calendarCycleAt(
      this.clock.now(),
      calendar,
      await this.closures.lastClosure(null),
    );
    return {
      startsAt: cycle.startsAt.toISOString(),
      closesAt: cycle.closesAt.toISOString(),
    };
  }
}
