import type { MyIssuedInvoicesView, MyIssuedInvoiceView } from "@lfd/contracts";

import type { Invoice } from "../domain/entities/invoice.js";
import type { InvoicePeriodsReader } from "../domain/ports/invoice-periods.reader.js";
import type { InvoiceSettlementFactsReader } from "../domain/ports/invoice-settlement-facts.reader.js";
import { settlementOf } from "../domain/services/invoice-settlement.js";
import {
  amountDueOf,
  filteredLedger,
  type LedgerEntry,
  type LedgerFilter,
} from "../domain/services/my-invoices-ledger.js";
import { summaryOf } from "./issued-invoice-view-support.js";

/** Les deux ports de lecture qu'une page « Mes factures » appelle, en plus du mur. */
export interface MyInvoicesReaders {
  readonly periods: InvoicePeriodsReader;
  readonly settlements: InvoiceSettlementFactsReader;
}

type Entry = LedgerEntry & { readonly view: MyIssuedInvoiceView };

/**
 * « Mes factures » d'une société, sur des pièces DÉJÀ passées au mur : le
 * règlement de chacune, le total dû sur TOUTES (§7.3), puis le filtre et
 * l'ordre — les plus récentes d'abord. Deux lectures par lot, quel que soit
 * le nombre de pièces.
 */
export async function myInvoicesViewOf(
  readers: MyInvoicesReaders,
  visible: readonly Invoice[],
  filter: LedgerFilter,
): Promise<MyIssuedInvoicesView> {
  const ids = visible.map((invoice) => invoice.id);
  const [periods, facts] = await Promise.all([
    readers.periods.periodsOf(ids),
    readers.settlements.factsOf(ids),
  ]);
  const entries = visible.map((invoice): Entry => {
    const state = invoice.toState();
    const known = facts.get(invoice.id);
    const settlement = settlementOf({
      isCreditNote: invoice.isCreditNote,
      paidOn: state.prepayment?.paidOn ?? null,
      dueOn: state.dueOn,
      debits: known?.debits ?? [],
      blocked: known?.blocked ?? false,
    });
    return {
      number: state.number,
      isCreditNote: invoice.isCreditNote,
      issuedOn: state.issuedOn,
      totalTtcCents: invoice.totalTtcCents,
      settlement,
      view: { ...summaryOf(invoice, periods.get(invoice.id) ?? null), settlement },
    };
  });
  return {
    invoices: filteredLedger(entries, filter).map((entry) => entry.view),
    amountDue: amountDueOf(entries),
  };
}
