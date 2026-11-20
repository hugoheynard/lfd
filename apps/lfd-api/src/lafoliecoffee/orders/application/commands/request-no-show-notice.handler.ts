import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Mail } from "../../../../mail/channels/requests/mail.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../mail/channels/templates/mail-locale.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { NoShowNoticeRefusedError } from "../../domain/errors/order-no-show-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderNoShowRepository,
  type LockedOrderNoShow,
} from "../../domain/ports/order-no-show.repository.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { RequestNoShowNoticeCommand } from "./request-no-show-notice.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
export const REQUEST_NO_SHOW_NOTICE_GESTURE = "orders.request-no-show-notice";

/** Préfixe de la clé d'idempotence du courriel : une par commande. */
const NO_SHOW_NOTICE = "order.no-show-notice";

/**
 * **« Prévenir le client »** — l'e-mail « commande non retirée », décidé par
 * la supervision du comptoir (`plan-commande-particulier-reglee-en-boutique.md`,
 * § 5 bis).
 *
 * Une transaction : la commande verrouillée, la demande tracée par l'agrégat
 * (déclarée non retirée, une fois par commande), le destinataire vérifié —
 * sans adresse lisible, rien n'est tracé —, et l'e-mail DEMANDÉ au bloc `mail`
 * dans la même transaction : il part après la validation, et une trace annulée
 * n'envoie rien. La fiche dit « demandé », jamais « envoyé ».
 *
 * Deux clés, deux rôles : l'intention de l'écran absorbe le double clic ; la
 * clé du courriel, une par commande (`order.no-show-notice:<id>`), garde le
 * fournisseur d'un second envoi. Aucun montant n'est écrit au client.
 *
 * @throws {OrderNotFoundError} @throws {NoShowNoticeRefusedError} et les refus
 * de `OrderNoShow.requestNotice`.
 */
@CommandHandler(RequestNoShowNoticeCommand)
export class RequestNoShowNoticeHandler implements ICommandHandler<
  RequestNoShowNoticeCommand,
  void
> {
  constructor(
    private readonly noShows: OrderNoShowRepository,
    private readonly recipients: OrderRecipientReader,
    private readonly mail: Mail,
    private readonly intents: OncePerIntent,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(command: RequestNoShowNoticeCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: REQUEST_NO_SHOW_NOTICE_GESTURE,
        subject: intentSubject(command.orderId),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.request(command, seal),
    );
  }

  private request(
    command: RequestNoShowNoticeCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    return this.uow.run(async () => {
      const locked = await this.noShows.lock(command.orderId);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      locked.noShow.requestNotice(this.clock.now(), command.staffUserId);
      await this.noShows.save(locked.noShow);
      await this.send(command.orderId, locked);
      await seal(undefined);
    });
  }

  /** Dans la transaction du geste : la trace et la demande tombent ensemble. */
  private async send(orderId: string, locked: LockedOrderNoShow): Promise<void> {
    const recipient = await this.recipients.findById(locked.placedByUserId);
    if (recipient === null) {
      throw new NoShowNoticeRefusedError(
        `Aucune adresse lisible pour la commande ${locked.noShow.reference} : l'e-mail n'a pas d'où partir. Appelez le client.`,
      );
    }
    await this.mail.send({
      to: recipient.email,
      template: "customer.order-not-collected",
      idempotencyKey: `${NO_SHOW_NOTICE}:${orderId}`,
      subjects: [{ type: "order", id: orderId }],
      data: {
        reference: locked.noShow.reference,
        pickupLabel: locked.pickupLabel,
        locale: locked.locale ?? DEFAULT_MAIL_LOCALE,
      },
    });
  }
}
