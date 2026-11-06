import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError, ReminderRefusedError } from "../../domain/errors/order-errors.js";
import { CustomerNudgeDelaysReader } from "../../domain/ports/customer-nudge-delays.reader.js";
import { OrderCustomerNudgesRepository } from "../../domain/ports/order-customer-nudges.repository.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { OrderReadyMail } from "../services/order-ready-mail.service.js";
import { SendHandoverReminderCommand } from "./send-handover-reminder.command.js";

/** Préfixe de la clé d'idempotence du courriel. */
const PICKUP_REMINDER = "order.pickup-reminder";

/**
 * **« Rappel au client »**, depuis la Supervision (Hugo, 2026-10-25).
 *
 * Une transaction : la commande verrouillée, le geste tracé par l'agrégat
 * (prête, retrait ouvert, délai écoulé après la fin du créneau, une fois par
 * commande), le destinataire vérifié — sans adresse lisible, rien n'est
 * tracé. Le courriel est DEMANDÉ au bloc `mail` dans la même transaction
 * (S2a) : il part après la validation, la réponse n'attend pas le
 * fournisseur, et le suivi des e-mails dit ce qui est parti.
 *
 * La clé d'idempotence est UNE par commande (`order.pickup-reminder:<id>`) :
 * le rappel ne part qu'une fois, et un envoi rejoué est absorbé par le
 * fournisseur. C'est le courriel « prête », en-tête de rappel (« elle vous
 * attend au point de retrait … »), QR compris.
 *
 * @throws {OrderNotFoundError} @throws {ReminderRefusedError} et les refus de
 * `OrderCustomerNudges.remindPickup`.
 */
@CommandHandler(SendHandoverReminderCommand)
export class SendHandoverReminderHandler implements ICommandHandler<
  SendHandoverReminderCommand,
  void
> {
  constructor(
    private readonly nudges: OrderCustomerNudgesRepository,
    private readonly delays: CustomerNudgeDelaysReader,
    private readonly recipients: OrderRecipientReader,
    private readonly mail: OrderReadyMail,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SendHandoverReminderCommand): Promise<void> {
    const { pickupReminderMinutes } = await this.delays.delays();
    await this.uow.run(async () => {
      const locked = await this.nudges.lock(command.orderId);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const { nudges } = locked;
      nudges.remindPickup(this.clock.now(), command.staffUserId, pickupReminderMinutes);
      await this.nudges.save(nudges);
      if ((await this.recipients.findById(locked.placedByUserId)) === null) {
        throw new ReminderRefusedError(
          `Aucune adresse lisible pour la commande ${nudges.reference} : le rappel n'a pas d'où partir. Appelez le client.`,
        );
      }
      // Demandé dans la transaction du geste (plan `plan-service-e-mails.md`,
      // S2a) : la trace et le courriel tombent ensemble. `false` — commande ou
      // client disparus entre-temps — est impossible ici : tous deux viennent
      // d'être lus sous le verrou.
      await this.mail.send(command.orderId, `${PICKUP_REMINDER}:${command.orderId}`, {
        reminder: true,
      });
    });
  }
}
