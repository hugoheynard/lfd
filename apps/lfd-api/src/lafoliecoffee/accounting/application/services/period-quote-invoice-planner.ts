import { Injectable } from "@nestjs/common";

import type { PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import { PeriodQuoteCommitmentGroupsError } from "../../domain/errors/period-quote-errors.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { CreditorReader } from "../../domain/ports/creditor.reader.js";
import { InvoiceIssuersReader } from "../../domain/ports/invoice-issuers.reader.js";
import { MonthlyInvoicingReader } from "../../domain/ports/monthly-invoicing.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { PayerCommitmentRequirementsReader } from "../../domain/ports/payer-commitment-requirements.reader.js";
import { PayersCollectionMeansReader } from "../../domain/ports/payers-collection-means.reader.js";
import { StatementBuyerReader } from "../../domain/ports/statement-buyer.reader.js";
import type { BillingCycle } from "../../domain/services/billing-cycle.js";
import { periodLabelOf } from "../../domain/services/invoicing-closures.js";
import {
  ordersByPayer,
  planMonthlyInvoices,
  type InvoiceableOrder,
  type PayerInvoicePlan,
} from "../../domain/services/monthly-invoicing.js";
import { closureIssuance, readIssuingParties } from "../closure-issuance.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import type { Issuance } from "../monthly-invoice-issuance.js";
import { unique } from "../unique-ids.js";

/** Ce qu'il faut pour émettre la facture d'un devis : l'`Issuance` et son unique groupe. */
export interface PeriodQuoteInvoicePlan {
  readonly issuance: Issuance;
  readonly group: PayerInvoicePlan;
}

/**
 * **La facture d'un devis de période, planifiée comme à la clôture** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD6 et v5 B2, S2) : ses
 * commandes, relues APRÈS que le numéro y a été écrit, sont regroupées par
 * `planMonthlyInvoices` — le découpage de la clôture —, et l'`Issuance` est
 * construite par la même fonction (`closureIssuance`).
 *
 * La période est celle **du devis** : le moyen et le début de période du
 * payeur se lisent à son `period_starts_at`, jamais au calendrier du jour.
 * Le calendrier de l'entité ne sert qu'au lot qui prendra une facture
 * émise après sa clôture (l'échéance d'un prélèvement).
 */
@Injectable()
export class PeriodQuoteInvoicePlanner {
  constructor(
    private readonly reader: MonthlyInvoicingReader,
    private readonly buyers: StatementBuyerReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly means: PayersCollectionMeansReader,
    private readonly requirements: PayerCommitmentRequirementsReader,
    private readonly creditors: CreditorReader,
    private readonly issuers: InvoiceIssuersReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
  ) {}

  /**
   * @throws {PeriodQuoteCommitmentGroupsError} les commandes ne font pas UNE
   *   facture de ce payeur, ou elle est déjà émise pour cette clôture.
   * @throws voir `readIssuingParties`.
   */
  async plan(
    quote: PeriodQuoteSnapshot,
    orders: readonly InvoiceableOrder[],
    at: Date,
  ): Promise<PeriodQuoteInvoicePlan> {
    const { legalEntityId } = quote;
    const { creditors, issuers, reader, buyers, mandates, means, requirements } = this;
    const parties = await readIssuingParties({ creditors, issuers }, legalEntityId);
    const follows = await reader.billingFollowsOf(unique(orders.map((order) => order.companyId)));
    const payers = ordersByPayer(orders, follows);
    const period: BillingCycle = { startsAt: quote.periodStartsAt, closesAt: quote.periodClosesAt };
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      legalEntityId,
    );
    const issuance = await closureIssuance(
      { reader, buyers, mandates, means, requirements },
      parties,
      {
        legalEntityId,
        period,
        periodLabel: periodLabelOf(period),
        closures: calendar,
        payerPeriodOf: () => period,
        at,
      },
      payers,
      follows,
    );
    const invoiced = await reader.invoicedGroups(legalEntityId, period.closesAt);
    const { invoices } = planMonthlyInvoices(
      payers,
      { legalEntityId, ...issuance.context },
      invoiced,
    );
    const [group, ...others] = invoices;
    if (
      group === undefined ||
      others.length > 0 ||
      group.payerId !== quote.payerCompanyId ||
      group.unbillable.length > 0
    ) {
      throw new PeriodQuoteCommitmentGroupsError(quote.number, invoices.length);
    }
    return { issuance, group };
  }
}
