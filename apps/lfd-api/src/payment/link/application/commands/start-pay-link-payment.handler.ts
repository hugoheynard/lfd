import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import {
  type CardCollection,
  CardPayments,
  type PreparedCardPayment,
} from "../../../channels/requests/card-payments.js";
import { LinkableSubjects } from "../../../channels/subjects/linkable-subjects.js";
import type { CardSubject } from "../../../channels/subjects/subject-settlement.js";
import { SubjectSettlements } from "../../../channels/subjects/subject-settlements.js";
import type { PayLink } from "../../domain/entities/pay-link.js";
import {
  PayLinkIntentClosedError,
  PayLinkSubjectNotPayableError,
  SubjectNotLinkableError,
  SubjectNotSettleableError,
} from "../../domain/errors/pay-link-errors.js";
import {
  type FirstCardPayment,
  FirstCardPaymentReader,
} from "../../domain/ports/first-card-payment.reader.js";
import { LivePayLinkLookup } from "../live-pay-link-lookup.js";
import { StartPayLinkPaymentCommand } from "./start-pay-link-payment.command.js";

/** Ce que la page reçoit : comment faire payer, et combien. */
export interface PayLinkPaymentStart {
  readonly collection: CardCollection;
  readonly amountCents: number;
}

/**
 * Crée ou relit l'intention du premier paiement d'un sujet, depuis son lien
 * (plan des liens, §2.3).
 *
 * L'ordre est celui de la passation : l'intention naît HORS transaction
 * (`prepare`), puis la ligne s'écrit sous le verrou du sujet (`lockSubject`)
 * avec le `pay_link_id` du lien. L'index `payment_first_per_subject_key`
 * n'admet qu'un `first` par sujet, quel que soit son état : un rejeu, ou une
 * course perdue, relit celui qui existe, et l'intention de trop est libérée.
 *
 * @sans-journal Geste anonyme d'un payeur, sans auteur à nommer : la trace
 * est la ligne `payment.card_payment` elle-même, qui naît avec son
 * `pay_link_id` ; rien n'y est encaissé — l'encaissement arrive par le
 * webhook, qui a sa propre trace.
 */
@CommandHandler(StartPayLinkPaymentCommand)
export class StartPayLinkPaymentHandler implements ICommandHandler<
  StartPayLinkPaymentCommand,
  PayLinkPaymentStart
> {
  constructor(
    private readonly lookup: LivePayLinkLookup,
    private readonly linkables: LinkableSubjects,
    private readonly settlements: SubjectSettlements,
    private readonly firsts: FirstCardPaymentReader,
    private readonly cards: CardPayments,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {PayLinkNotFoundError} jeton inconnu ou lien révoqué.
   * @throws {PayLinkSubjectNotPayableError} sujet réglé ou annulé.
   * @throws {PayLinkIntentClosedError} l'intention relue est close.
   */
  async execute(command: StartPayLinkPaymentCommand): Promise<PayLinkPaymentStart> {
    const link = await this.lookup.of(command.token);
    const subject: CardSubject = { type: link.subjectType, id: link.subjectId };
    const amountCents = await this.payableAmount(subject);
    const existing = await this.firsts.firstOf(subject.type, subject.id);
    if (existing !== null) {
      return this.reread(existing);
    }
    return this.create(link, subject, amountCents);
  }

  private async payableAmount(subject: CardSubject): Promise<number> {
    const linkable = this.linkables.forType(subject.type);
    if (linkable === null) {
      throw new SubjectNotLinkableError(subject.type);
    }
    const quote = await linkable.quote(subject);
    if (!quote.payable) {
      throw new PayLinkSubjectNotPayableError(quote.reason);
    }
    return quote.amountCents;
  }

  private async create(
    link: PayLink,
    subject: CardSubject,
    amountCents: number,
  ): Promise<PayLinkPaymentStart> {
    const settlement = this.settlements.forType(subject.type);
    if (settlement === null) {
      throw new SubjectNotSettleableError(subject.type);
    }
    const { prepared, collection } = await this.cards.prepare(
      subject.type,
      amountCents,
      `pay-link:${link.id}`,
    );
    const attached = await this.attachUnderLock(link, subject, prepared, async () =>
      settlement.lockSubject(subject),
    );
    if (attached) {
      return { collection, amountCents };
    }
    await this.cards.release(prepared);
    const winner = await this.firsts.firstOf(subject.type, subject.id);
    if (winner === null) {
      throw new PayLinkIntentClosedError();
    }
    return this.reread(winner);
  }

  /** Rend `false` quand un `first` est né entre la lecture et le verrou. */
  private async attachUnderLock(
    link: PayLink,
    subject: CardSubject,
    prepared: PreparedCardPayment,
    lock: () => Promise<void>,
  ): Promise<boolean> {
    try {
      return await this.uow.run(async () => {
        await lock();
        if ((await this.firsts.firstOf(subject.type, subject.id)) !== null) {
          return false;
        }
        await this.cards.attach(subject, prepared, "first", { payLinkId: link.id });
        return true;
      });
    } catch (error) {
      await this.cards.release(prepared);
      throw error;
    }
  }

  private async reread(first: FirstCardPayment): Promise<PayLinkPaymentStart> {
    const retrieved = await this.cards.retrieve(first.paymentId);
    if (retrieved.state === "canceled") {
      throw new PayLinkIntentClosedError();
    }
    return { collection: retrieved.collection, amountCents: first.amountCents };
  }
}
