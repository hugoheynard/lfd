import type { UnpaidTransferInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnpaidTransferInvoicesReader } from "../../domain/ports/unpaid-transfer-invoices.reader.js";
import { parisDayOf } from "../../domain/services/collection-test-file.js";
import { transferArrearsOf } from "../../domain/services/transfer-arrears.js";
import { ListUnpaidTransferInvoicesQuery } from "./list-unpaid-transfer-invoices.query.js";

/**
 * **Les impayés de factures au virement** (V8, C7) : ce que le suivi de la
 * comptabilité et la fiche client montrent. Le retard se juge au jour de
 * Paris ; on le SIGNALE, rien ne bloque (Q2). Le total ne compte que les
 * factures en retard de la liste.
 */
@QueryHandler(ListUnpaidTransferInvoicesQuery)
export class ListUnpaidTransferInvoicesHandler implements IQueryHandler<
  ListUnpaidTransferInvoicesQuery,
  UnpaidTransferInvoicesView
> {
  constructor(
    private readonly unpaid: UnpaidTransferInvoicesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ListUnpaidTransferInvoicesQuery): Promise<UnpaidTransferInvoicesView> {
    const arrears = transferArrearsOf(
      await this.unpaid.unpaid({
        legalEntityId: query.legalEntityId,
        payerCompanyId: query.payerCompanyId,
      }),
      parisDayOf(this.clock.now()),
    ).filter((arrear) => !query.overdueOnly || arrear.overdue);
    return {
      invoices: arrears.map((arrear) => ({
        invoiceId: arrear.invoiceId,
        number: arrear.number,
        legalEntityId: arrear.legalEntityId,
        legalEntityName: arrear.legalEntityName,
        payerCompanyId: arrear.payerCompanyId,
        payerName: arrear.payerName,
        issuedOn: arrear.issuedOn,
        dueOn: arrear.dueOn,
        amountCents: arrear.remainingCents,
        overdue: arrear.overdue,
        daysLate: arrear.daysLate,
      })),
      overdueCents: arrears
        .filter((arrear) => arrear.overdue)
        .reduce((sum, arrear) => sum + arrear.remainingCents, 0),
    };
  }
}
