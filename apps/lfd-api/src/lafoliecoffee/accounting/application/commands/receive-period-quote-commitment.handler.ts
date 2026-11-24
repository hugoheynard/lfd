import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PeriodQuoteCommitmentReceivedEvent } from "../../domain/events/period-quote.events.js";
import { PeriodQuoteInvoicing } from "../services/period-quote-invoicing.js";
import { ReceivePeriodQuoteCommitmentCommand } from "./receive-period-quote-commitment.command.js";

/**
 * **« Engagement reçu »** (QD6), scellé par l'intention de l'écran : le
 * numéro écrit sur les commandes du devis, sa facture émise, le devis
 * `invoiced` (`PeriodQuoteInvoicing`), puis le fait
 * `period_quote.commitment_received` au journal et le sceau — tout dans UNE
 * transaction. Un refus défait tout et ne scelle rien : le geste se refait.
 * Un rejeu de la même clé rend la même facture sans rien réémettre.
 *
 * La facture part ensuite comme toute facture : son fait durable
 * `invoice.issued` la fait rendre en PDF et annoncer au payeur.
 *
 * @returns l'identifiant de la facture émise.
 * @throws voir `PeriodQuoteInvoicing.invoice`.
 */
@CommandHandler(ReceivePeriodQuoteCommitmentCommand)
export class ReceivePeriodQuoteCommitmentHandler implements ICommandHandler<
  ReceivePeriodQuoteCommitmentCommand,
  string
> {
  constructor(
    private readonly invoicing: PeriodQuoteInvoicing,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ReceivePeriodQuoteCommitmentCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "accounting.receive-period-quote-commitment",
        subject: intentSubject(command.quoteId),
      },
      CREATED_ID_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const done = await this.invoicing.invoice({
            quoteId: command.quoteId,
            number: command.number,
            staffUserId: command.staffUserId,
          });
          await this.events.publishTraced(
            new PeriodQuoteCommitmentReceivedEvent(
              done.quote,
              done.commitmentNumber,
              { id: done.invoiceId, number: done.invoiceNumber },
              done.orderCount,
              this.clock.now(),
            ),
          );
          await seal(done.invoiceId);
          return done.invoiceId;
        }),
    );
  }
}
