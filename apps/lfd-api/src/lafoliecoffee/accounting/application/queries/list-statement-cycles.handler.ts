import type { StatementCyclesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { InvoicingFloorReader } from "../../domain/ports/invoicing-floor.reader.js";
import { listedStatementPeriods } from "../../domain/services/statement-periods.js";
import { statementCycleView, statementPeriodsOf } from "../statement-period-support.js";
import { ListStatementCyclesQuery } from "./cycle-statement-queries.js";

/**
 * Les dernières périodes de relevé, la plus récente d'abord (plan
 * `plan-rythme-de-facturation.md`, §14 R5 ; §16.9 M4a) : celles DU payeur
 * nommé (`?companyId=`) — ses semaines s'il est hebdomadaire —, sinon celles
 * du calendrier de l'entité en service.
 *
 * La période en cours, puis celles closes APRÈS la mise en service de la
 * facture par période (`invoicing_floor`) : avant, rien n'a été facturé par
 * période. Une période plus ancienne se demande encore par `?periodClosesAt=`.
 */
@QueryHandler(ListStatementCyclesQuery)
export class ListStatementCyclesHandler implements IQueryHandler<
  ListStatementCyclesQuery,
  StatementCyclesView
> {
  constructor(
    private readonly clock: Clock,
    private readonly issuers: InvoiceIssuersReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
    private readonly floors: InvoicingFloorReader,
  ) {}

  async execute(query: ListStatementCyclesQuery): Promise<StatementCyclesView> {
    const sequence = await statementPeriodsOf(
      { issuers: this.issuers, modeDates: this.modeDates, payerModes: this.payerModes },
      query.payerCompanyId,
    );
    const periods = listedStatementPeriods(this.clock.now(), sequence, await this.floors.floor());
    return { cycles: periods.map(statementCycleView) };
  }
}
