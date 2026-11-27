import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import {
  type CardCollection,
  type CardPaymentLabel,
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
  PayLinkWithdrawnError,
  SubjectNotLinkableError,
  SubjectNotSettleableError,
} from "../../domain/errors/pay-link-errors.js";
import { PayLinkOrigins } from "../../domain/ports/pay-link-origins.js";
import { PayLinkRepository } from "../../domain/ports/pay-link.repository.js";
import {
  type FirstCardPayment,
  FirstCardPaymentReader,
} from "../../domain/ports/first-card-payment.reader.js";
import { LivePayLinkLookup } from "../live-pay-link-lookup.js";
import { StartPayLinkPaymentCommand } from "./start-pay-link-payment.command.js";

/**
 * L'issue du rattachement sous verrou : écrit, devancé par un autre `first`,
 * ou refusé parce que le sujet ou le lien ne veut plus être payé.
 */
type Attachment =
  | { readonly kind: "attached" }
  | { readonly kind: "taken" }
  | {
      readonly kind: "refused";
      readonly error: PayLinkSubjectNotPayableError | PayLinkWithdrawnError;
    };

/** Le canal et le mouvement d'un paiement né d'un lien, en métadonnée. */
const PAY_LINK_CHANNEL = "pay_link";

/** Ce que la page reçoit : comment faire payer, et combien. */
export interface PayLinkPaymentStart {
  readonly collection: CardCollection;
  readonly amountCents: number;
}

/**
 * Crée ou relit l'intention du premier paiement d'un sujet, depuis son lien.
 *
 * L'ordre est celui de la passation : l'intention naît HORS transaction
 * (`prepare`), puis la ligne s'écrit sous le verrou du sujet (`lockSubject`)
 * avec le `pay_link_id` du lien. L'index `payment_first_per_subject_key`
 * n'admet qu'un `first` par sujet, quel que soit son état : un rejeu, ou une
 * course perdue, relit celui qui existe, et l'intention de trop est libérée.
 *
 * 🔴 **Sous le verrou, le devis et la vie du lien sont relus.** Le devis lu
 * avant `prepare` n'est qu'un premier tri : une annulation qui croise
 * l'ouverture de la page prend le même verrou du sujet. Elle passe ou bien
 * avant le rattachement — qui relit alors un sujet non payable ou un lien
 * révoqué, libère l'intention et répond 409 — ou bien après, et c'est elle
 * qui voit le premier paiement et le fait annuler.
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
    private readonly links: PayLinkRepository,
    private readonly uow: UnitOfWork,
    private readonly origins: PayLinkOrigins,
  ) {}

  /**
   * @throws {PayLinkNotFoundError} jeton inconnu ou lien révoqué.
   * @throws {PayLinkSubjectNotPayableError} sujet réglé ou annulé.
   * @throws {PayLinkIntentClosedError} l'intention relue est close.
   * @throws {PayLinkWithdrawnError} le lien a été révoqué pendant la préparation.
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
    const due = await this.dueOf(subject);
    if (typeof due !== "number") {
      throw due;
    }
    return due;
  }

  /** Le montant dû, ou le refus du sujet qui ne veut plus être payé. */
  private async dueOf(subject: CardSubject): Promise<number | PayLinkSubjectNotPayableError> {
    const linkable = this.linkables.forType(subject.type);
    if (linkable === null) {
      throw new SubjectNotLinkableError(subject.type);
    }
    const quote = await linkable.quote(subject);
    return quote.payable ? quote.amountCents : new PayLinkSubjectNotPayableError(quote.reason);
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
      this.labelOf(link, subject),
    );
    const attachment = await this.attachUnderLock(link, subject, prepared, async () =>
      settlement.lockSubject(subject),
    );
    if (attachment.kind === "attached") {
      return { collection, amountCents };
    }
    await this.cards.release(prepared);
    if (attachment.kind === "refused") {
      throw attachment.error;
    }
    const winner = await this.firsts.firstOf(subject.type, subject.id);
    if (winner === null) {
      throw new PayLinkIntentClosedError();
    }
    return this.reread(winner);
  }

  /**
   * Sous le verrou du sujet : le lien encore vivant, le sujet encore payable,
   * aucun `first` né entre-temps — puis la ligne.
   */
  private async attachUnderLock(
    link: PayLink,
    subject: CardSubject,
    prepared: PreparedCardPayment,
    lock: () => Promise<void>,
  ): Promise<Attachment> {
    try {
      return await this.uow.run(async (): Promise<Attachment> => {
        await lock();
        const live = await this.links.liveOf(subject.type, subject.id);
        if (live?.id !== link.id) {
          return { kind: "refused", error: new PayLinkWithdrawnError() };
        }
        const due = await this.dueOf(subject);
        if (typeof due !== "number") {
          return { kind: "refused", error: due };
        }
        if ((await this.firsts.firstOf(subject.type, subject.id)) !== null) {
          return { kind: "taken" };
        }
        await this.cards.attach(subject, prepared, "first", { payLinkId: link.id });
        return { kind: "attached" };
      });
    } catch (error) {
      await this.cards.release(prepared);
      throw error;
    }
  }

  /**
   * Le libellé d'un paiement par lien (le-pointage-stripe.md, § 7) : aucun
   * payeur — la page est anonyme —, l'application d'origine du lien et le
   * sujet opaque. `app` est la valeur que l'application pose sur ses autres
   * intentions (un seul filtre chez le prestataire) ; l'origine persistée
   * reste lisible sous `origin`. Une origine sortie du registre se nomme par
   * sa valeur.
   */
  private labelOf(link: PayLink, subject: CardSubject): CardPaymentLabel {
    const origin = this.origins.find(link.origin);
    return {
      description: `LFD · ${origin?.label ?? link.origin} lien de paiement · lien`,
      metadata: {
        app: origin?.providerApp ?? link.origin,
        origin: link.origin,
        channel: PAY_LINK_CHANNEL,
        kind: PAY_LINK_CHANNEL,
        subject_id: subject.id,
      },
    };
  }

  private async reread(first: FirstCardPayment): Promise<PayLinkPaymentStart> {
    const retrieved = await this.cards.retrieve(first.paymentId);
    if (retrieved.state === "canceled") {
      throw new PayLinkIntentClosedError();
    }
    return { collection: retrieved.collection, amountCents: first.amountCents };
  }
}
