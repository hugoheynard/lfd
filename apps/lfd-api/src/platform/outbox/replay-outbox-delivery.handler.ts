import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../time/clock.js";
import { OutboxDeliveryRepository } from "./outbox-delivery.repository.js";
import { OutboxDeliveryNotFoundError } from "./outbox-errors.js";
import { OutboxRelayTrigger } from "./outbox-relay-trigger.js";
import { ReplayOutboxDeliveryCommand } from "./replay-outbox-delivery.command.js";

/**
 * Le rejeu manuel d'un couple message × abonné : essais à zéro, dû tout de
 * suite, puis le relais est réveillé — l'abonné réparé reçoit sans attendre le
 * prochain cron.
 *
 * @sans-journal la livraison porte elle-même son état ; BE1 n'a pas d'écran.
 * @throws {OutboxDeliveryNotFoundError} le couple n'existe pas.
 * @throws {OutboxDeliveryAlreadyDeliveredError} il est déjà livré.
 */
@CommandHandler(ReplayOutboxDeliveryCommand)
export class ReplayOutboxDeliveryHandler implements ICommandHandler<ReplayOutboxDeliveryCommand> {
  constructor(
    private readonly deliveries: OutboxDeliveryRepository,
    private readonly relay: OutboxRelayTrigger,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReplayOutboxDeliveryCommand): Promise<void> {
    const delivery = await this.deliveries.load(command.eventId, command.subscriber);
    if (delivery === null) {
      throw new OutboxDeliveryNotFoundError(command.eventId, command.subscriber);
    }
    delivery.replay(this.clock.now());
    await this.deliveries.save(delivery);
    this.relay.wake();
  }
}
