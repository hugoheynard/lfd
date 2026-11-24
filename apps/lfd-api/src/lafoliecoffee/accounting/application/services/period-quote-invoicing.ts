import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PeriodQuote, PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import { PeriodQuoteNotFoundError } from "../../domain/errors/period-quote-errors.js";
import { MonthlyInvoiceOutcomes } from "../../domain/ports/monthly-invoice-outcomes.js";
import { OrderRowsLock } from "../../domain/ports/order-rows-lock.js";
import { PeriodQuoteOrdersReader } from "../../domain/ports/period-quote-orders.reader.js";
import { PeriodQuoteRepository } from "../../domain/ports/period-quote.repository.js";
import { QuotedOrdersCommitment } from "../../domain/ports/quoted-orders-commitment.js";
import { draftOf, outcomeKey } from "../monthly-invoice-issuance.js";
import { InvoiceIssuer } from "./invoice-issuer.js";
import { PeriodQuoteInvoicePlanner } from "./period-quote-invoice-planner.js";

/** Le numéro reçu, tel que le geste le transmet. */
export interface PeriodQuoteCommitmentRequest {
  readonly quoteId: string;
  readonly number: string;
  readonly staffUserId: string;
}

/** Le devis facturé et sa facture. */
export interface InvoicedPeriodQuote {
  readonly quote: PeriodQuoteSnapshot;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly issuedOn: string;
  /** Le numéro tel que les commandes le portent désormais (forme normalisée). */
  readonly commitmentNumber: string;
  /** Les commandes facturées. */
  readonly orderCount: number;
}

/**
 * **« Engagement reçu » : le numéro écrit, la facture du devis émise** (plan
 * `plan-clients-publics-chorus.md`, § 6 sexies, QD6 et v5 B1, B2, S2) — dans
 * UNE transaction, celle de l'appelant :
 *
 * 1. les lignes `orders` du devis verrouillées (`OrderRowsLock`), puis le
 *    devis relu sous ce verrou ;
 * 2. ses commandes relues, annulées retirées ; le devis refuse s'il n'attend
 *    plus ou si l'empreinte a changé (`acceptCommitment`) ;
 * 3. le numéro écrit sur chaque commande par la commande elle-même
 *    (`QuotedOrdersCommitment.acceptQuoted`) ;
 * 4. les commandes RELUES sous le verrou, regroupées comme à la clôture —
 *    un seul groupe, jamais `withoutMovedCommitments` contre le plan d'avant
 *    l'écriture (`PeriodQuoteInvoicePlanner`) ;
 * 5. la facture émise (`InvoiceIssuer`, son fait `invoice.issued` avec elle),
 *    son issue `issued` rangée sous sa clé ;
 * 6. le devis `invoiced`, sa facture posée.
 *
 * Un refus à n'importe quelle étape défait tout : le devis reste en attente.
 * Les autres payeurs de la clôture ne sont pas touchés.
 */
@Injectable()
export class PeriodQuoteInvoicing {
  constructor(
    private readonly quotes: PeriodQuoteRepository,
    private readonly rows: OrderRowsLock,
    private readonly orders: PeriodQuoteOrdersReader,
    private readonly commitments: QuotedOrdersCommitment,
    private readonly planner: PeriodQuoteInvoicePlanner,
    private readonly issuer: InvoiceIssuer,
    private readonly outcomes: MonthlyInvoiceOutcomes,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PeriodQuoteNotFoundError} le devis n'existe pas.
   * @throws {PeriodQuoteCommitmentClosedError} il est facturé ou remplacé.
   * @throws {PeriodQuoteCommitmentOutdatedError} ses commandes ont changé.
   * @throws {PeriodQuoteCommitmentGroupsError} elles ne font plus une facture.
   * @throws ce que la commande refuse (numéro mal formé, déjà numérotée…) et
   *   ce que l'émission refuse (`InvoiceIssuanceBlockedError`…).
   */
  invoice(request: PeriodQuoteCommitmentRequest): Promise<InvoicedPeriodQuote> {
    return this.uow.run(async () => {
      const quote = await this.lockedQuote(request.quoteId);
      const live = await this.orders.liveOrdersOf(quote.orderIds);
      quote.acceptCommitment(live);
      const orderIds = live.map((order) => order.orderId);
      await this.commitments.acceptQuoted({
        quoteId: quote.id,
        quoteNumber: quote.number,
        orderIds,
        number: request.number,
        staffUserId: request.staffUserId,
      });
      const numbered = await this.orders.liveOrdersOf(orderIds);
      const { issuance, group } = await this.planner.plan(
        quote.toSnapshot(),
        numbered,
        this.clock.now(),
      );
      const invoice = await this.issuer.issue({
        legalEntityId: issuance.legalEntityId,
        issuedOn: issuance.issuedOn,
        draft: (reserved) => draftOf(group, issuance, this.ids.next(), reserved),
      });
      await this.outcomes.recordIssued(outcomeKey(group, issuance), invoice.id);
      const invoiced = quote.invoiced(invoice.id);
      await this.quotes.recordInvoiced(invoiced);
      return {
        quote: invoiced.toSnapshot(),
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        issuedOn: issuance.issuedOn,
        commitmentNumber: group.budgetCommitment?.number ?? "",
        orderCount: group.billable.length,
      };
    });
  }

  /**
   * Le devis relu SOUS le verrou de ses commandes : un renvoi concurrent, qui
   * prend le même verrou, est passé avant (le devis est alors remplacé) ou
   * attend celui-ci.
   */
  private async lockedQuote(quoteId: string): Promise<PeriodQuote> {
    const first = await this.quotes.load(quoteId);
    if (first === null) {
      throw new PeriodQuoteNotFoundError(quoteId);
    }
    await this.rows.lockAll(first.orderIds);
    const quote = await this.quotes.load(quoteId);
    if (quote === null) {
      throw new PeriodQuoteNotFoundError(quoteId);
    }
    return quote;
  }
}
