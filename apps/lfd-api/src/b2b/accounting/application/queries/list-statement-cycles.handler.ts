import type { StatementCyclesView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { BillingRhythmReader } from "../../domain/ports/billing-rhythm.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { InvoicingFloorReader } from "../../domain/ports/invoicing-floor.reader.js";
import { listedStatementPeriods } from "../../domain/services/statement-periods.js";
import { statementCycleView, statementTimeline } from "../statement-period-support.js";
import { ListStatementCyclesQuery } from "./cycle-statement-queries.js";

/**
 * Les dernières périodes de relevé, **au rythme de l'entité en service**, la
 * plus récente d'abord (plan `plan-rythme-de-facturation.md`, §14, R5).
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
    private readonly rhythms: BillingRhythmReader,
    private readonly floors: InvoicingFloorReader,
  ) {}

  async execute(): Promise<StatementCyclesView> {
    const timeline = await statementTimeline({ issuers: this.issuers, rhythms: this.rhythms });
    const periods = listedStatementPeriods(this.clock.now(), timeline, await this.floors.floor());
    return { cycles: periods.map(statementCycleView) };
  }
}
