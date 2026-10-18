import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineDeliveryRepository } from "../../domain/ports/vitrine-delivery.repository.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { VitrineDelivery } from "../../domain/vitrine-delivery.js";
import { VitrineRelay } from "../services/vitrine-relay.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { SendVitrineTestCommand } from "./send-vitrine-test.command.js";

/**
 * Envoie un essai à l'instant — l'agence vérifie sa signature avant le
 * premier vrai changement. Un essai ne relance pas, ne compte pas dans la
 * séquence, et un essai refusé ne met pas l'abonné en échec. Le verdict se
 * lit au journal des envois.
 *
 * @sans-journal un geste d'essai, lisible au journal des envois.
 */
@CommandHandler(SendVitrineTestCommand)
export class SendVitrineTestHandler implements ICommandHandler<SendVitrineTestCommand, string> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly deliveries: VitrineDeliveryRepository,
    private readonly relay: VitrineRelay,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: SendVitrineTestCommand): Promise<string> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    subscriber.assertActive();
    const delivery = VitrineDelivery.test({
      id: this.ids.next(),
      subscriberId: subscriber.id,
      at: this.clock.now(),
    });
    await this.relay.attempt(delivery, subscriber);
    await this.deliveries.save(delivery);
    return delivery.id;
  }
}
