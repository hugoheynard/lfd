import type { ContentLocale } from "@lfd/contracts";
import { Inject, Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DEFAULT_MAIL_LOCALE } from "../../../../platform/mailer/copy/mail-copy.js";
import { MAILER, type B2bMailer } from "../../../../platform/mailer/mailer.tokens.js";
import { Clock } from "../../../../platform/time/clock.js";
import { DelayWarningRefusedError } from "../../domain/errors/customer-nudge-errors.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { CustomerNudgeDelaysReader } from "../../domain/ports/customer-nudge-delays.reader.js";
import { OrderCustomerNudgesRepository } from "../../domain/ports/order-customer-nudges.repository.js";
import { OrderMailOrigins } from "../../domain/ports/order-mail-origins.js";
import { OrderRecipientReader } from "../../domain/ports/order-recipient.reader.js";
import { WarnCustomerOfDelayCommand } from "./warn-customer-of-delay.command.js";

/** Nom du travail de fond, et préfixe de la clé d'idempotence du courriel. */
const DELAY_WARNING = "order.delay-warning";

/** Ce qui part au client, figé sous le verrou. */
interface DelayLetter {
  readonly to: string;
  readonly reference: string;
  readonly pickupLabel: string | null;
  readonly locale: ContentLocale;
}

/**
 * **« Avertir le client »** : « Votre commande prend du retard », depuis la
 * Supervision (Hugo, 2026-10-25).
 *
 * Même déroulé que le rappel : la commande verrouillée, le geste tracé par
 * l'agrégat (PAS prête, retrait ouvert, délai écoulé après la fin du
 * créneau, une fois par commande), le destinataire vérifié — sans adresse,
 * rien n'est tracé —, puis le courriel EN FOND après la validation, clé
 * `order.delay-warning:<id>`. Il ne promet aucune heure : le client sera
 * prévenu par le courriel « prête ». L'adresse n'est jamais journalisée.
 *
 * @throws {OrderNotFoundError} @throws {DelayWarningRefusedError} et les
 * refus de `OrderCustomerNudges.warnDelay`.
 */
@CommandHandler(WarnCustomerOfDelayCommand)
export class WarnCustomerOfDelayHandler implements ICommandHandler<
  WarnCustomerOfDelayCommand,
  void
> {
  private readonly logger = new Logger(WarnCustomerOfDelayHandler.name);

  constructor(
    private readonly nudges: OrderCustomerNudgesRepository,
    private readonly delays: CustomerNudgeDelaysReader,
    private readonly recipients: OrderRecipientReader,
    private readonly origins: OrderMailOrigins,
    @Inject(MAILER) private readonly mailer: B2bMailer,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly work: BackgroundWork,
  ) {}

  async execute(command: WarnCustomerOfDelayCommand): Promise<void> {
    const { delayWarningMinutes } = await this.delays.delays();
    const letter = await this.uow.run(async () => {
      const locked = await this.nudges.lock(command.orderId);
      if (locked === null) {
        throw new OrderNotFoundError(command.orderId);
      }
      const { nudges } = locked;
      nudges.warnDelay(this.clock.now(), command.staffUserId, delayWarningMinutes);
      await this.nudges.save(nudges);
      const recipient = await this.recipients.findById(locked.placedByUserId);
      if (recipient === null) {
        throw new DelayWarningRefusedError(
          `Aucune adresse lisible pour la commande ${nudges.reference} : l'avertissement n'a pas d'où partir. Appelez le client.`,
        );
      }
      return {
        to: recipient.email,
        reference: nudges.reference,
        pickupLabel: locked.pickupLabel,
        locale: locked.locale ?? DEFAULT_MAIL_LOCALE,
      };
    });
    void this.work.track(this.send(command.orderId, letter), DELAY_WARNING);
  }

  /** Ne lève jamais : un échec est journalisé, sans l'adresse. */
  private async send(orderId: string, letter: DelayLetter): Promise<void> {
    const client = this.origins.clientBaseUrl();
    try {
      await this.mailer.send({
        to: letter.to,
        template: "customer.order-delayed",
        idempotencyKey: `${DELAY_WARNING}:${orderId}`,
        data: {
          reference: letter.reference,
          pickupLabel: letter.pickupLabel,
          orderUrl: client === null ? "" : `${client}/mes-commandes`,
          locale: letter.locale,
        },
      });
    } catch (error: unknown) {
      this.logger.error(`Avertissement de retard non envoyé (${letter.reference}).`, error);
    }
  }
}
