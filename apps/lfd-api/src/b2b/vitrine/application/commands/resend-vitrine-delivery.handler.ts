import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  VitrineDeliveryInFlightError,
  VitrineDeliveryNotFoundError,
  VitrineSubscriberFailingError,
} from "../../domain/errors/vitrine-errors.js";
import { VitrineDeliveryRepository } from "../../domain/ports/vitrine-delivery.repository.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { ResendVitrineDeliveryCommand } from "./resend-vitrine-delivery.command.js";

/**
 * Remet un envoi en attente : il repart au prochain balayage, essais remis à
 * zéro. Refusé quand un autre attend déjà (un seul en vol, B3 — la base le
 * refuserait aussi) et quand l'abonné est en échec (« tout renvoyer » d'abord :
 * renvoyer un vieux signal ne le resynchronise pas).
 *
 * @sans-journal un geste de reprise, lisible au journal des envois.
 */
@CommandHandler(ResendVitrineDeliveryCommand)
export class ResendVitrineDeliveryHandler implements ICommandHandler<ResendVitrineDeliveryCommand> {
  constructor(
    private readonly deliveries: VitrineDeliveryRepository,
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ResendVitrineDeliveryCommand): Promise<void> {
    await this.uow.run(async () => {
      const delivery = await this.deliveries.load(command.deliveryId);
      if (delivery === null) {
        throw new VitrineDeliveryNotFoundError(command.deliveryId);
      }
      const subscriber = await loadVitrineSubscriber(this.subscribers, delivery.subscriberId);
      subscriber.assertActive();
      if (!subscriber.isDeliverable) {
        throw new VitrineSubscriberFailingError(subscriber.name);
      }
      const pending = await this.deliveries.pendingChangeOf(subscriber.id);
      if (pending !== null && pending.id !== delivery.id) {
        throw new VitrineDeliveryInFlightError();
      }
      delivery.requeue(this.clock.now());
      await this.deliveries.save(delivery);
    });
  }
}
