import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { PeriodQuote } from "../../domain/entities/period-quote.js";
import { PeriodQuoteOrdersTakenError } from "../../domain/errors/period-quote-errors.js";
import { PeriodQuoteIssuedFact } from "../../domain/events/period-quote-issued.fact.js";
import { CancelledOrdersReader } from "../../domain/ports/cancelled-orders.reader.js";
import { OrderBudgetCommitmentsReader } from "../../domain/ports/order-budget-commitments.reader.js";
import { OrderRowsLock } from "../../domain/ports/order-rows-lock.js";
import { PeriodQuoteRepository } from "../../domain/ports/period-quote.repository.js";
import {
  groupOrderIds,
  withoutCancelled,
  withoutMovedCommitments,
} from "../../domain/services/invoice-group-under-lock.js";
import { periodTagOf } from "../../domain/services/invoicing-closures.js";
import type { PayerInvoicePlan } from "../../domain/services/monthly-invoicing.js";
import type { Issuance, PayerIssue } from "../monthly-invoice-issuance.js";

/**
 * **Le devis de période, rangé à la clôture** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD3 et v5 B3, S4). Une
 * transaction courte par groupe, comme une facture :
 *
 * 1. les lignes `orders` du groupe verrouillées (`OrderRowsLock`), ses
 *    annulées et ses engagements corrigés retirés — la règle de l'émission ;
 * 2. le rang de la période pris au compteur, le devis v1 construit sur les
 *    commandes facturables (empreinte et total calculés par lui) ;
 * 3. le devis et ses commandes rangés en `ON CONFLICT DO NOTHING` : un devis
 *    vivant déjà là pour ce groupe gagne, et le passage ne range rien ;
 * 4. si la base n'a pas pris toutes les commandes, empreinte et total sont
 *    recalculés sur celles qu'elle a prises ;
 * 5. le fait durable `period_quote.issued` écrit avec lui.
 *
 * Aucune issue dans `invoice_monthly_outcome`, aucun `invoice.signalled` :
 * le devis remplace la facture de ce groupe. Un refus est rendu à l'appelant,
 * qui le signale comme le refus d'une facture.
 */
@Injectable()
export class PeriodQuoteShelver {
  constructor(
    private readonly quotes: PeriodQuoteRepository,
    private readonly rows: OrderRowsLock,
    private readonly cancelled: CancelledOrdersReader,
    private readonly commitments: OrderBudgetCommitmentsReader,
    private readonly ids: IdGenerator,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws ce que le devis ou la base refusent — rien n'est alors rangé. */
  shelve(planned: PayerInvoicePlan, issuance: Issuance): Promise<PayerIssue> {
    const { payerId } = planned;
    return this.uow.run(async (): Promise<PayerIssue> => {
      const group = await this.liveGroup(planned);
      if (group === null || group.billable.length === 0) {
        return { kind: "void", payerCompanyId: payerId };
      }
      const quote = await this.draft(group, issuance);
      const kept = await this.quotes.insertAwaiting(quote);
      if (kept === null) {
        return { kind: "void", payerCompanyId: payerId };
      }
      if (kept.size === 0) {
        throw new PeriodQuoteOrdersTakenError(quote.toSnapshot().payerName);
      }
      const shelved = kept.size === quote.orderIds.length ? quote : quote.keeping(kept);
      if (shelved !== quote) {
        await this.quotes.save(shelved);
      }
      await this.durable.publish(new PeriodQuoteIssuedFact(shelved.id).durableFact());
      return { kind: "quoted", payerCompanyId: payerId, number: shelved.number };
    });
  }

  /** Le groupe sous le verrou de ses lignes `orders` — la règle de `issueFor`. */
  private async liveGroup(planned: PayerInvoicePlan): Promise<PayerInvoicePlan | null> {
    const ids = groupOrderIds(planned);
    await this.rows.lockAll(ids);
    // `cancelledAmong` rend des NUMÉROS de commande, pas des identifiants.
    const live = withoutCancelled(planned, new Set(await this.cancelled.cancelledAmong(ids)));
    return live === null
      ? null
      : withoutMovedCommitments(live, await this.commitments.commitmentsOf(ids));
  }

  private async draft(group: PayerInvoicePlan, issuance: Issuance): Promise<PeriodQuote> {
    const closesAt = issuance.period.closesAt;
    return PeriodQuote.shelve({
      id: this.ids.next(),
      rank: await this.quotes.nextRank(issuance.legalEntityId, periodTagOf(closesAt)),
      legalEntityId: issuance.legalEntityId,
      payerCompanyId: group.payerId,
      payerName: issuance.context.names.get(group.payerId) ?? group.payerId,
      mandateId: group.mandate?.mandateId ?? null,
      serviceCode: group.budgetCommitment?.serviceCode ?? "",
      periodStartsAt: issuance.calendar.payerPeriodOf(group.payerId, closesAt).startsAt,
      periodClosesAt: closesAt,
      orders: group.billable,
      createdAt: issuance.at,
    });
  }
}
