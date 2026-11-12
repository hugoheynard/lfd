import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineDeliveryRepository } from "../../domain/ports/vitrine-delivery.repository.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { VitrineDelivery } from "../../domain/vitrine-delivery.js";
import { VitrineRelay } from "../services/vitrine-relay.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { SendVitrineTestCommand } from "./send-vitrine-test.command.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "vitrine.send-test";

/**
 * Envoie un essai à l'instant — l'agence vérifie sa signature avant le
 * premier vrai changement. Un essai ne relance pas, ne compte pas dans la
 * séquence, et un essai refusé ne met pas l'abonné en échec. Un abonné en
 * lecture seule (sans adresse) est refusé : rien ne lui part. Le verdict se
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
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : un double clic n'envoie pas deux tests à
   * l'agence. La clé est scellée avec la livraison de test ; l'appel à
   * l'agence part avant, hors transaction.
   */
  execute(command: SendVitrineTestCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject(command.subscriberId),
      },
      CREATED_ID_REPLAY,
      (seal) => this.send(command, seal),
    );
  }

  private async send(
    command: SendVitrineTestCommand,
    seal: (deliveryId: string) => Promise<void>,
  ): Promise<string> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    subscriber.assertActive();
    subscriber.assertHasEndpoint();
    const delivery = VitrineDelivery.test({
      id: this.ids.next(),
      subscriberId: subscriber.id,
      at: this.clock.now(),
    });
    await this.relay.attempt(delivery, subscriber);
    await this.uow.run(async () => {
      await this.deliveries.save(delivery);
      await seal(delivery.id);
    });
    return delivery.id;
  }
}
