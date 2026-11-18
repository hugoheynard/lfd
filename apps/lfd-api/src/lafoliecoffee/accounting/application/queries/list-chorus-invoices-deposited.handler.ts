import type { ChorusInvoicesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ChorusInvoicesReader } from "../../domain/ports/chorus-invoices.reader.js";
import { chorusInvoicesViewOf } from "../chorus-invoice-view.js";
import { ListChorusInvoicesDepositedQuery } from "./list-chorus-invoices-deposited.query.js";

/** La page « Chorus Pro » (plan `plan-clients-publics-chorus.md`, T4′). N'écrit rien. */
@QueryHandler(ListChorusInvoicesDepositedQuery)
export class ListChorusInvoicesDepositedHandler implements IQueryHandler<
  ListChorusInvoicesDepositedQuery,
  ChorusInvoicesView
> {
  constructor(private readonly invoices: ChorusInvoicesReader) {}

  async execute(query: ListChorusInvoicesDepositedQuery): Promise<ChorusInvoicesView> {
    return chorusInvoicesViewOf(
      await this.invoices.deposited({ legalEntityId: query.legalEntityId }),
    );
  }
}
