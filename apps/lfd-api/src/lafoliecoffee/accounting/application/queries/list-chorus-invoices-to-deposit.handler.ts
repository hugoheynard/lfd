import type { ChorusInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ChorusInvoicesReader } from "../../domain/ports/chorus-invoices.reader.js";
import { chorusInvoicesViewOf } from "../chorus-invoice-view.js";
import { ListChorusInvoicesToDepositQuery } from "./list-chorus-invoices-to-deposit.query.js";

/** La page « Chorus Pro » (plan `plan-clients-publics-chorus.md`, T4′). N'écrit rien. */
@QueryHandler(ListChorusInvoicesToDepositQuery)
export class ListChorusInvoicesToDepositHandler implements IQueryHandler<
  ListChorusInvoicesToDepositQuery,
  ChorusInvoicesView
> {
  constructor(private readonly invoices: ChorusInvoicesReader) {}

  async execute(query: ListChorusInvoicesToDepositQuery): Promise<ChorusInvoicesView> {
    return chorusInvoicesViewOf(
      await this.invoices.toDeposit({ legalEntityId: query.legalEntityId }),
    );
  }
}
