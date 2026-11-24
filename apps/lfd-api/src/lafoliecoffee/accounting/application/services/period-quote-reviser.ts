import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PeriodQuoteResend } from "../../domain/entities/period-quote.js";
import { PeriodQuoteNotFoundError } from "../../domain/errors/period-quote-errors.js";
import { PeriodQuoteIssuedFact } from "../../domain/events/period-quote-issued.fact.js";
import { OrderRowsLock } from "../../domain/ports/order-rows-lock.js";
import { PeriodQuoteOrdersReader } from "../../domain/ports/period-quote-orders.reader.js";
import { PeriodQuoteRepository } from "../../domain/ports/period-quote.repository.js";

/**
 * **Revoit un devis contre ses commandes d'aujourd'hui** (QD5, v5 S4), dans
 * la transaction de l'appelant (ou la sienne) :
 *
 * 1. le devis relu, les lignes `orders` de ses commandes verrouillées
 *    (`OrderRowsLock`) — la règle de l'émission, que « Engagement reçu »
 *    reprendra ;
 * 2. ses commandes relues, annulées retirées, l'empreinte recalculée par le
 *    devis lui-même (`PeriodQuote.resend`) ;
 * 3. empreinte différente : l'ancienne version passe `superseded`, PUIS la
 *    nouvelle et ses commandes sont insérées (un conflit lève), et le fait
 *    durable `period_quote.issued` part pour elle — son abonné la rend et
 *    l'envoie.
 *
 * @throws {PeriodQuoteNotFoundError} le devis n'existe pas.
 * @throws {PeriodQuoteNotAwaitingError} il est facturé ou déjà remplacé.
 */
@Injectable()
export class PeriodQuoteReviser {
  constructor(
    private readonly quotes: PeriodQuoteRepository,
    private readonly rows: OrderRowsLock,
    private readonly orders: PeriodQuoteOrdersReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly durable: DurablePublisher,
    private readonly uow: UnitOfWork,
  ) {}

  revise(quoteId: string): Promise<PeriodQuoteResend> {
    return this.uow.run(async () => {
      const quote = await this.quotes.load(quoteId);
      if (quote === null) {
        throw new PeriodQuoteNotFoundError(quoteId);
      }
      await this.rows.lockAll(quote.orderIds);
      const orders = await this.orders.liveOrdersOf(quote.orderIds);
      const outcome = quote.resend(orders, this.ids.next(), this.clock.now());
      if (outcome.kind === "renewed") {
        await this.quotes.replace(outcome.superseded, outcome.successor);
        await this.durable.publish(new PeriodQuoteIssuedFact(outcome.successor.id).durableFact());
      }
      return outcome;
    });
  }
}
