import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { PeriodQuoteSnapshot } from "../../domain/entities/period-quote.js";
import { PeriodQuoteNobodyToNotifyError } from "../../domain/errors/period-quote-errors.js";
import { PeriodQuoteResentEvent } from "../../domain/events/period-quote.events.js";
import { PeriodQuoteDocumentRenderer } from "../services/period-quote-document-renderer.js";
import { PeriodQuoteNoticeSender } from "../services/period-quote-notice-sender.js";
import { PeriodQuoteReviser } from "../services/period-quote-reviser.js";
import { ResendPeriodQuoteCommand } from "./resend-period-quote.command.js";

/** La version revue : neuve et déjà scellée, ou la même, encore à envoyer. */
interface Revised {
  readonly renewed: boolean;
  readonly quote: PeriodQuoteSnapshot;
}

/**
 * **Renvoie un devis de période** (QD4, QD5), scellé par l'intention de
 * l'écran. L'empreinte est recalculée sur les commandes du devis :
 *
 * - **égale** : la même version repart — son PDF déjà rangé, rendu sinon —,
 *   sous la clé `period-quote-resend:<intention>:<destinataire>` : le bloc ne
 *   la tait pas, un double clic ne la double pas. Personne à prévenir : 409
 *   nommé, rien n'est scellé ;
 * - **différente** : une version n+1 est rangée (l'ancienne `superseded`), et
 *   son fait durable la fait rendre et envoyer par l'abonné, sous la clé de
 *   l'envoi automatique — une nouvelle version ne part qu'une fois.
 *
 * Fait `period_quote.resent` au journal, dans la transaction qui scelle.
 *
 * @returns l'identifiant de la version envoyée.
 * @throws {PeriodQuoteNotFoundError} le devis n'existe pas.
 * @throws {PeriodQuoteNotAwaitingError} il est facturé ou déjà remplacé.
 * @throws {PeriodQuoteNobodyToNotifyError} le payeur n'a personne à prévenir.
 */
@CommandHandler(ResendPeriodQuoteCommand)
export class ResendPeriodQuoteHandler implements ICommandHandler<ResendPeriodQuoteCommand, string> {
  constructor(
    private readonly reviser: PeriodQuoteReviser,
    private readonly documents: PeriodQuoteDocumentRenderer,
    private readonly sender: PeriodQuoteNoticeSender,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ResendPeriodQuoteCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: "accounting.resend-period-quote",
        subject: intentSubject(command.quoteId),
      },
      CREATED_ID_REPLAY,
      (seal) => this.resend(command, seal),
    );
  }

  private async resend(
    command: ResendPeriodQuoteCommand,
    seal: (quoteId: string) => Promise<void>,
  ): Promise<string> {
    const sent = await this.uow.run(async (): Promise<Revised> => {
      const outcome = await this.reviser.revise(command.quoteId);
      if (outcome.kind === "unchanged") {
        return { renewed: false, quote: outcome.quote.toSnapshot() };
      }
      const successor = outcome.successor.toSnapshot();
      await this.events.publishTraced(
        new PeriodQuoteResentEvent(successor, true, null, this.clock.now()),
      );
      await seal(successor.id);
      return { renewed: true, quote: successor };
    });
    return sent.renewed ? sent.quote.id : this.resendSameVersion(sent.quote, command, seal);
  }

  /** La même version : le document rangé, puis la demande et le journal, scellés ensemble. */
  private async resendSameVersion(
    quote: PeriodQuoteSnapshot,
    command: ResendPeriodQuoteCommand,
    seal: (quoteId: string) => Promise<void>,
  ): Promise<string> {
    const document = await this.documents.ensure(quote);
    return this.uow.run(async () => {
      const count = await this.sender.request(
        quote,
        document,
        (recipientId) => `period-quote-resend:${command.intentKey}:${recipientId}`,
      );
      if (count === 0) {
        throw new PeriodQuoteNobodyToNotifyError(quote.number);
      }
      await this.events.publishTraced(
        new PeriodQuoteResentEvent(quote, false, count, this.clock.now()),
      );
      await seal(quote.id);
      return quote.id;
    });
  }
}
