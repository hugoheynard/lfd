import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError, ReminderRefusedError } from "../../domain/errors/order-errors.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderReadyMail } from "../services/order-ready-mail.service.js";
import { SendHandoverReminderCommand } from "./send-handover-reminder.command.js";

/**
 * **Le rappel de retrait**, depuis la file du comptoir.
 *
 * ## 🔴 Il ne part que si la commande est DÉCLARÉE PRÊTE
 *
 * Et ce n'est pas une précaution d'écran : le message envoyé dit « votre
 * commande vous attend », avec le QR de retrait. L'envoyer sur une commande que
 * le fournil n'a pas colisée ferait venir quelqu'un devant un comptoir qui n'a
 * rien à lui tendre — la seule chose pire que de ne pas prévenir.
 *
 * Le retard, lui, n'entre pas dans la règle. Une commande prête et pas encore
 * retirée se rappelle à toute heure ; c'est à l'équipe de juger quand, pas à un
 * seuil d'horloge.
 *
 * ## Pourquoi il se répète, là où le colisage ne se répète pas
 *
 * Le colisage compose une clé d'idempotence déterministe : un fait rejoué ne
 * fait pas partir un second message. Un rappel n'existe que pour repartir — sa
 * clé porte donc l'instant. C'est la MÊME fonction d'envoi ({@link
 * OrderReadyMail}) : ce qui diffère est la clé, et elle vient de l'appelant
 * précisément pour que ce choix soit lisible ici.
 */
@CommandHandler(SendHandoverReminderCommand)
export class SendHandoverReminderHandler implements ICommandHandler<
  SendHandoverReminderCommand,
  void
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly mail: OrderReadyMail,
    private readonly clock: Clock,
  ) {}

  async execute(command: SendHandoverReminderCommand): Promise<void> {
    const owned = await this.orders.findById(command.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    if (owned.view.readyAt === null) {
      throw new ReminderRefusedError(
        "Cette commande n'est pas encore déclarée prête : le rappel ferait venir le client pour rien.",
      );
    }
    const sent = await this.mail.send(
      command.orderId,
      `order.ready-reminder:${command.orderId}:${this.clock.now().toISOString()}`,
    );
    if (!sent) {
      throw new ReminderRefusedError(
        "Aucune adresse lisible pour cette commande : le rappel n'a pas d'où partir.",
      );
    }
  }
}
